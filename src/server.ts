import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { Firestore } from "@google-cloud/firestore";
import { v4 as uuidv4 } from "uuid";
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "todogoals-ea6d4.firebasestorage.app", // Replace with your bucket URL
  });
}

type MessageData = 
  | {
      sender_id: string;
      chat_id: string;
      message_type: "text";
      message_content: string;
      timestamp: string;
    }
  | {
      sender_id: string;
      chat_id: string;
      message_type: "image";
      image_url: string;
      timestamp: string;
    };

const bucket = admin.storage().bucket();
console.log("BUCKET", bucket);

// Initialize Express
const app = express();
app.use(cors());

const db = new Firestore();

// Create an HTTP server
const httpServer = createServer(app);

// Initialize Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Replace with your frontend's origin
    methods: ["GET", "POST"],
  },
});

// Define the WebSocket behavior
io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a room for user communication
  socket.on("join-room", async ({ userId, matchedWith }) => {
    const roomId = [userId, matchedWith].sort().join("-");
    socket.join(roomId);
    console.log(`User ${userId} joined room: ${roomId}`);

    try {
      // Fetch message history for the room
      console.log("ROOM ID", roomId);
      const chatRef = db.collection("chats").doc(roomId).collection("messages");
      const snapshot = await chatRef.orderBy("timestamp", "asc").get();

      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log("MESSAGES", messages);

      // Emit message history only to the joining user
      io.to(roomId).emit("message-history", {
        messages,
      });

      // Optional: Notify others in the room (excluding the joining user) about the new user
      socket.to(roomId).emit("user-joined", { userId, roomId });
    } catch (error) {
      console.error("Error fetching message history:", error);
      socket.emit("error", { message: "Failed to fetch message history." });
    }
    
  });

  // Handle messages
  socket.on("send-message", async ({ roomId, message, messageType, senderId, imagePath }) => {
    console.log(`Message in room ${roomId}:`, message);
    // Save message to Firestore
    const chatRef = db.collection("chats").doc(roomId); // Use roomId as chat_id
    const messageRef = chatRef.collection("messages").doc(uuidv4()); // Auto-generated document ID for messages

    let messageData: MessageData;

    if (messageType === "text") {
      messageData = {
        sender_id: senderId,
        chat_id: roomId,
        message_type: "text",
        message_content: message,
        timestamp: new Date().toISOString(),
      };
    } else if (messageType === "image") {
      console.log("MESSAGE TYPE IS IMAGE");
      const imageName = `${roomId}/${uuidv4()}.jpg`;
      console.log("IMAGE NAME", imageName);
      console.log("BUCKET NAME", bucket.name);
      const file = bucket.file(imageName);
      console.log("FILE", file);
  
      // Upload image to Firebase Storage
      const imageBuffer = Buffer.from(imagePath, 'base64');
      console.log("IMAGE BUFFER CREATED");

      // Upload the file
      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/jpeg', // Ensure the content type matches the file type
        },
      });

      console.log("FILE SAVED");

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2025', // Set an expiration date
      });
      
      console.log("IMAGE URL", url);
  
      // Get public URL
      messageData = {
        sender_id: senderId,
        chat_id: roomId,
        message_type: "image",
        image_url: url,
        timestamp: new Date().toISOString(),
      };    
      console.log("MESSAGE DATA", messageData);

      const chatDoc = await chatRef.get();
      let scores = chatDoc.exists ? chatDoc.data()?.scores || {} : {};

      const today = new Date().toISOString().split("T")[0]; // Get YYYY-MM-DD format

      // Get last message date for sender
      const userScore = scores[senderId] || { streak: 0, lastMessageDate: null };
      const lastDate = userScore.lastMessageDate;

      let newStreak = 1; // Default to 1 (reset)

      if (lastDate) {
          const lastMessageDate = new Date(lastDate);
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          if (lastMessageDate.toISOString().split("T")[0] === yesterday.toISOString().split("T")[0]) {
              newStreak = userScore.streak + 1; // +1 if consecutive day
          }
      }

      // Update scores in Firestore
      scores[senderId] = { streak: newStreak, lastMessageDate: today };
      await chatRef.update({ scores });
    }

    await messageRef.set(messageData);

    io.to(roomId).emit("receive-message", messageData);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Add a health check endpoint
app.get("/", (req, res) => {
  res.send("Socket service is running!");
});

// Start the server
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
