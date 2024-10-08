const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { default: axios } = require('axios');
// const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config()

// middleware


app.use(cors({
    origin: ['https://cse-p-diu.web.app', 'http://localhost:5173']
}));
app.use(express.json());
app.use(cookieParser());





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cse-p-diu.rspdn.mongodb.net/?retryWrites=true&w=majority&appName=CSE-P-DIU`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email service (e.g., Gmail)
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
        user: process.env.SENDER_EMAIL, // Your email address
        pass: process.env.SENDER_PASS, // Your email password or app-specific password
    },
});

// Own middleware
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Not authorized' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Not authorized' });
        }
        req.user = decoded; // Assign the decoded token to req.user for later use
        next(); // Proceed only if the token is valid
    });
};


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection


        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log(user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET)

            res
                .cookie('token', token, {
                    httpOnly: false,
                    secure: false,
                    sameSite: 'none'
                })
                .send({ success: true });
        });

        const csepdiuDBCollection = client.db('usersDB').collection('userInfo');
        const csepdiuPostCollection = client.db('postDB').collection('allPosts');
        const csepdiuNotices = client.db('NoticesDB').collection('Notices');

        app.get('/users', async (req, res) => {
            const cursor = csepdiuDBCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });


        app.get('/posts', async (req, res) => {
            const cursor = csepdiuPostCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });


        app.post('/posts', async (req, res) => {
            const post = req.body;
            // console.log(post);
            const result = await csepdiuPostCollection.insertOne(post);
            res.send(post);
        });



        app.put('/users/uid/:uid', async (req, res) => {
            const updatedUser = req.body;

            const query = { uid: updatedUser.uid }; // Adjust this if `uid` is correct
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    name: updatedUser.name,
                    studentId: updatedUser.studentId,
                    batchNo: updatedUser.batchNo,
                    section: updatedUser.section,
                    photourl: updatedUser.photourl,
                },
            };

            // Perform the update using the correct filter and update document
            const result = await csepdiuDBCollection.updateOne(query, updateDoc, options);
            res.send(result);
        });




        app.get('/users/uid/:uid', async (req, res) => {
            const uid = req.params.uid;
            const query = { uid: uid }; // Querying by uid instead of _id
            const user = await csepdiuDBCollection.findOne(query);
            if (user) {
                res.send(user);
            } else {
                res.status(404).send({ message: 'User not found' });
            }
        });

        app.get('/posts/:_id', async (req, res) => {
            const id = req.params._id;
            const query = { _id: new ObjectId(id) };
            const post = await csepdiuPostCollection.findOne(query);
            if (post) {
                res.send(post);
            }
            else {
                res.status(404).send({ message: 'Post not found' });
            }
        });

        app.put('/posts/:id', async (req, res) => {
            const id = req.params.id;
            const updatedPost = req.body;
            const query = { _id: new ObjectId(id) };
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    postTitle: updatedPost.updatedTitle,
                    postDetails: updatedPost.updatedDetails,
                },
            };

            try {
                const result = await csepdiuPostCollection.updateOne(query, updateDoc, options);
                res.send(result);
            } catch (error) {
                console.error("Error updating post:", error);
                res.status(500).send({ error: 'Failed to update post' });
            }
        });



        app.get('/profile/:uid/posts', async (req, res) => {
            const uid = req.params.uid;
            const query = { uploaderUid: uid };

            try {
                const posts = await csepdiuPostCollection.find(query).sort({ uploadDate: -1, uploadTime: -1 }).toArray();
                if (posts.length > 0) {
                    res.send(posts);
                } else {
                    res.status(404).send({ message: 'No posts found for this user' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error retrieving posts', error });
            }
        });




        app.post('/posts/:id/comments', async (req, res) => {
            const postId = req.params.id;
            const commentPackage = req.body;
            try {
                const result = await csepdiuPostCollection.updateOne(
                    { _id: new ObjectId(postId) },
                    { $push: { commentOnPost: commentPackage } }
                );
                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: 'Comment added successfully' });
                } else {
                    res.status(404).send({ message: 'Post not found or no changes made' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error adding comment', error });
            }
        });

        app.post('/posts/:id/reacts', async (req, res) => {
            const postId = req.params.id;
            const reactPackage = req.body;
            try {
                const result = await csepdiuPostCollection.updateOne(
                    { _id: new ObjectId(postId) },
                    { $push: { reactOnPost: reactPackage } }
                );
                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: 'react added successfully' });
                } else {
                    res.status(404).send({ message: 'Post not found or no changes made' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error adding react', error });
            }
        });


        app.get('/posts/:id/comments', async (req, res) => {
            const postId = req.params.id;

            try {
                const post = await csepdiuPostCollection.findOne(
                    { _id: new ObjectId(postId) },
                    { projection: { commentOnPost: 1, _id: 0 } }
                );

                if (post) {
                    res.status(200).send(post.commentOnPost);
                } else {
                    res.status(404).send({ message: 'Post not found' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error retrieving comments', error });
            }
        });




        app.get('/posts/:id/reacts', async (req, res) => {
            const postId = req.params.id;
            try {
                const post = await csepdiuPostCollection.findOne(
                    { _id: new ObjectId(postId) },
                    { projection: { reactOnPost: 1, _id: 0 } }
                );
                if (post) {
                    res.status(200).send(post.reactOnPost);
                } else {
                    res.status(404).send({ message: 'Post not found' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error retrieving comments', error });
            }
        });


        app.delete('/posts/:id/reacts', async (req, res) => {
            const postId = req.params.id;
            const { userUid } = req.body;

            try {
                const result = await csepdiuPostCollection.updateOne(
                    { _id: new ObjectId(postId) },
                    { $pull: { reactOnPost: { userUid: userUid } } }
                );
                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: 'React removed successfully' });
                } else {
                    res.status(404).send({ message: 'Post not found or no react to remove' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error removing react', error });
            }
        });



        app.delete('/posts/:postId/comments', async (req, res) => {
            const postId = req.params.postId;
            const { userUid, uploadTime, uploadDate, postComment } = req.body;
            try {
                const result = await csepdiuPostCollection.updateOne(
                    { _id: new ObjectId(postId) },
                    {
                        $pull: {
                            commentOnPost: {
                                uid: userUid,
                                uploadTime: uploadTime,
                                uploadDate: uploadDate,
                                postComment: postComment,
                                postId: postId,
                            }
                        }
                    }
                );

                if (result.modifiedCount > 0) {
                    res.status(200).send({ message: 'Comment removed successfully' });
                } else {
                    res.status(404).send({ message: 'Post not found or no comment to remove' });
                }
            } catch (error) {
                res.status(500).send({ message: 'Error removing comment', error });
            }
        });


        app.delete('/posts/:id', async (req, res) => {
            const postId = req.params.id;

            if (!ObjectId.isValid(postId)) {
                return res.status(400).send({ error: 'Invalid ID format' });
            }

            const query = { _id: new ObjectId(postId) };
            try {
                const result = await csepdiuPostCollection.deleteOne(query);
                if (result.deletedCount === 1) {
                    res.status(200).send({ message: 'Post deleted successfully' });
                } else {
                    res.status(404).send({ error: 'Post not found' });
                }
            } catch (error) {
                res.status(500).send({ error: 'An error occurred during deletion' });
            }
        });




        app.post('/users', async (req, res) => {
            const newUser = req.body;
            console.log(newUser);
            const result = await csepdiuDBCollection.insertOne(newUser);
            res.send(newUser);
        });

        app.get('/studentInfo/:studentId', async (req, res) => {
            const { studentId } = req.params;
            console.log(studentId);
            try {
                const url = `http://software.diu.edu.bd:8006/result/studentInfo?studentId=${studentId}`;
                const result = await axios.get(url);
                console.log(result.data);
                res.send(result.data);
            } catch (error) {
                console.log(error);
            }
        });


        app.get('/results/:semesterId/:studentId', async (req, res) => {
            const { semesterId, studentId } = req.params;
            console.log(req.params);

            const url = `http://software.diu.edu.bd:8006/result?grecaptcha=&semesterId=${semesterId}&studentId=${studentId}`;
            try {
                const result = await axios.get(url);
                console.log(result);
                res.send(result.data);
            } catch (error) {
                console.error('Error fetching the semester result:', error);
                throw error;
            }
        });

        app.get('/semesterlist', async (req, res) => {
            const { semesterId, studentId } = req.params;
            console.log(req.params);

            const url = `http://software.diu.edu.bd:8006/result/semesterList`;
            try {
                const result = await axios.get(url);
                console.log(result);
                res.send(result.data);
            } catch (error) {
                console.error('Error fetching the semester result:', error);
                throw error;
            }
        });





        app.post('/notices', async (req, res) => {
            const formData = req.body;
            try {
              const result = await csepdiuNotices.insertOne(formData);
              res.status(200).json({ message: 'Notice uploaded successfully!', data: result });
            } catch (error) {
              console.error('Error saving notice:', error);
              res.status(500).json({ message: 'Error saving notice', error });
            }
          });
      
      
          app.get('/notices', async (req, res) => {
            try {
              const notices = await csepdiuNotices.find().toArray();
              res.status(200).json(notices);
            } catch (error) {
              console.error('Error:', error);
              res.status(500).json({ message: 'Error:', error });
            }
          });
      
          app.get('/notices/:id', async (req, res) => {
            const { id } = req.params;
            try {
              const message = await csepdiuNotices.findOne({ _id: new ObjectId(id) });
              if (message) {
                res.status(200).json(message);
              } else {
                res.status(404).json({ message: 'Nothing Found' });
              }
            } catch (error) {
              console.error('Error retrieving data:', error);
              res.status(500).json({ message: 'Error retrieving data', error });
            }
          });


          app.put('/notices/:id', async (req, res) => {
            const noticeId = req.params.id;
            const userId = req.body.userId;
        
            try {
                // Push the userId to the 'seen' array only if it's not already there
                await csepdiuNotices.findByIdAndUpdate(noticeId, {
                    $set: { seen: userId }
                });
                res.json({ message: 'User marked as seen' });
            } catch (error) {
                res.status(500).json({ message: 'Error updating seen status' });
            }
        });
      
      
          app.delete('/notices/:id', async (req, res) => {
            const { id } = req.params;
      
            try {
              const result = await csepdiuNotices.deleteOne({ _id: new ObjectId(id) });
              if (result.deletedCount > 0) {
                res.status(200).json({ message: 'Notice deleted successfully!' });
              } else {
                res.status(404).json({ message: 'Notice not found' });
              }
            } catch (error) {
              console.error('Error deleting Notice:', error);
              res.status(500).json({ message: 'Error deleting Notice', error });
            }
          });


        app.post('/send-email', async (req, res) => {
            const { to, subject, html } = req.body;

            const mailOptions = {
                from: process.env.EMAIL_USER, // Sender address
                to, // List of recipients
                subject, // Subject of the email
                html, // Plain text body
            };
            try {
                const info = await transporter.sendMail(mailOptions);
                res.status(200).json({ message: 'Email sent successfully!', info });
            } catch (error) {
                console.error('Error sending email:', error);
                res.status(500).json({ message: 'Error sending email', error });
            }
        });



        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('server is running');
})

app.listen(port, () => {
    console.log(`Server Port: ${port}`);
})