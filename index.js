const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const app = express()
const port = process.env.PORT || 5000
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_OWNER}:${process.env.DB_PASSWORD}@cluster0.wcxgg.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
app.get('/', (req, res) => {
    res.send('Hello World!')
})
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
const tokenVerification = async (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized Acess' })
    }
    jwt.verify(req.headers.authorization.split(' ')[1], process.env.SECRET_KEY, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "Forbidden Acess" })
        }
        if (decoded.email !== req.headers.email) {
            return res.status(403).send({ message: "Forbidden Acess" })
        }
        next()
    });
}
const run = async () => {
    try {
        await client.connect();
        const productCollection = client.db('assingment-12').collection('products')
        const reviewCollection = client.db('assingment-12').collection('reviews')
        const orderCollection = client.db('assingment-12').collection('orders')
        const userCollection = client.db('assingment-12').collection('users')

        const adminVerification = async (req, res, next) => {
            const requester = await userCollection.findOne({ email: req.headers.email })
            if (requester.role === 'Admin') {
                next()
            }
            else {
                res.status(401).send({ message: 'Unauthorized Access' })
            }
        }


        // non verify api start here


        app.get('/all-products', async (req, res) => {
            const result = await productCollection.find({}).toArray()
            if (req.query.location) {
                return res.send(result)
            }
            if (result.length <= 6) {
                return res.send(result)
            }
            else {
                return res.send(result.slice(0, 6))
            }
        })
        app.get('/all-reviews', async (req, res) => {
            const result = await reviewCollection.find({}).toArray()
            const sortedArray = result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            return res.send(sortedArray)
        })
        app.get('/token-issue', async (req, res) => {
            const token = jwt.sign({ email: req.query.email }, process.env.SECRET_KEY, {
                expiresIn: "24h"
            })
            res.send({ token: token })
        })
        app.put('/user', async (req, res) => {
            const filter = { email: req.body.email }
            const options = { upsert: true }
            const updatedDoc = {
                $set: req.body
            }
            const result = await userCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })
        app.get('/check-role', async (req, res) => {
            const query = { email: req.query.email }
            const result = await userCollection.findOne(query)
            res.send({ admin: result?.role === 'Admin' })
        })



        // must need jwt verification



        app.get('/product', tokenVerification, async (req, res) => {
            res.send(await productCollection.findOne({ id: req.query.id }))
        })
        app.post('/add-order', tokenVerification, async (req, res) => {
            const filter = { id: req.body.productId }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    available: parseInt(req.query.current)
                }
            }
            const result = await productCollection.updateOne(filter, updatedDoc, options)
            if (result.acknowledged) {
                const result = await orderCollection.insertOne(req.body)
                res.send(result)
            }
            else {
                res.status(502).send({ message: 'Something went wrong' })
            }
        })
        app.post('/add-review', tokenVerification, async (req, res) => {
            res.send(await reviewCollection.insertOne(req.body))
        })
        app.get('/user-profile', tokenVerification, async (req, res) => {
            res.send(await userCollection.findOne({ email: req.query.email }))
        })
        app.put('/update-profile', tokenVerification, async (req, res) => {
            const filter = { email: req.query.email }
            const options = { upsert: true }
            const updatedDoc = {
                $set: req.body
            }
            const result = await userCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })
        app.get('/all-orders', tokenVerification, async (req, res) => {
            res.send(await orderCollection.find({ email: req.query.email }).toArray())
        })
        app.delete('/delete-order', tokenVerification, async (req, res) => {
            const canceledProduct = await productCollection.findOne({ id: req.body.productId })
            const newQuantity = parseInt(canceledProduct.available) + parseInt(req.body.quantity)
            const filter = { id: req.body.productId }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    available: newQuantity
                }
            }
            const result = await productCollection.updateOne(filter, updatedDoc, options)
            if (result.acknowledged) {
                return res.send(await orderCollection.deleteOne({ _id: ObjectId(req.query.id) }))
            }
            else {
                return res.send(401).send({ message: 'Bad Request' })
            }
        })
        app.get('/payment', tokenVerification, async (req, res) => {
            res.send(await orderCollection.findOne({ orderId: req.query.id }))
        })
        app.post('/create-payment-intent', tokenVerification, async (req, res) => {
            const cost = req.body.cost;
            const amount = cost * 100
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        })
        app.put('/complete-payment', tokenVerification, async (req, res) => {
            const filter = { orderId: req.query.id }
            const options = { upsert: true }
            const updatedDoc = {
                $set: req.body
            }
            const result = await orderCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })



        // must need both adming verify and jwt verify



        app.get('/manage-orders', tokenVerification, adminVerification, async (req, res) => {
            if (req.query.first || req.query.all) {
                return res.send(await orderCollection.find({}).toArray())
            }
            if (req.query.unpaid) {
                return res.send(await orderCollection.find({ status: 'Not Paid' }).toArray())
            }
            if (req.query.paid) {
                return res.send(await orderCollection.find({ status: 'Paid' }).toArray())
            }
            if (req.query.shipped) {
                return res.send(await orderCollection.find({ status: 'Shipped' }).toArray())
            }
            if (req.query.search) {
                return res.send(await orderCollection.find({ email: req.query.search }).toArray())
            }
        })
        app.delete('/admin-delete-order', tokenVerification, adminVerification, async (req, res) => {
            const canceledProduct = await productCollection.findOne({ id: req.body.productId })
            const newQuantity = parseInt(canceledProduct.available) + parseInt(req.body.quantity)
            const filter = { id: req.body.productId }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    available: newQuantity
                }
            }
            const result = await productCollection.updateOne(filter, updatedDoc, options)
            if (result.acknowledged) {
                return res.send(await orderCollection.deleteOne({ _id: ObjectId(req.query.id) }))
            }
            else {
                return res.send(401).send({ message: 'Bad Request' })
            }
        })
        app.put('/ship-order', tokenVerification, adminVerification, async (req, res) => {
            const filter = { _id: ObjectId(req.query.id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    status: 'Shipped'
                }
            }
            const result = await orderCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })

        app.get('/admin-all-product', tokenVerification, adminVerification, async (req, res) => {
            res.send(await productCollection.find({}).toArray())
        })

    }
    finally { }
}
run().catch(console.dir)
