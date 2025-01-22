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
    storageBucket: "https://todogoals-ea6d4.appspot.com", // Replace with your bucket URL
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
      const file = bucket.file(imageName);
      console.log("FILE", file);
  
      // Upload image to Firebase Storage
      await file.save(Buffer.from(imagePath, 'base64'), {
        metadata: { contentType: 'image/jpeg' },
      });
  
      // Get public URL
      const imageUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
      console.log("IMAGE URL", imageUrl);
      messageData = {
        sender_id: senderId,
        chat_id: roomId,
        message_type: "image",
        image_url: imageUrl,
        timestamp: new Date().toISOString(),
      };    
      console.log("MESSAGE DATA", messageData);
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
