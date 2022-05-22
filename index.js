const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
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
const run = async () => {
    try {
        await client.connect();
        const productCollection = client.db('assingment-12').collection('products')
        const reviewCollection = client.db('assingment-12').collection('reviews')
        const orderCollection = client.db('assingment-12').collection('orders')
        app.get('/all-products', async (req, res) => {
            res.send(await productCollection.find({}).toArray())
        })
        app.get('/all-reviews', async (req, res) => {
            res.send(await reviewCollection.find({}).toArray())
        })
        app.get('/product', async (req, res) => {
            res.send(await productCollection.findOne({ id: req.query.id }))
        })
        app.post('/add-order', async (req, res) => {
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
        app.get('/token-issue', async (req, res) => {
            const token = jwt.sign({ email: req.query.email }, process.env.SECRET_KEY, {
                expiresIn: "24h"
            })
            res.send({ token: token })
        })
    }
    finally { }
}
run().catch(console.dir)
