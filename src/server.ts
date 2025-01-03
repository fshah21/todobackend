import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { Firestore } from "@google-cloud/firestore";
import { v4 as uuidv4 } from "uuid";

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
  socket.on("join-room", ({ userId, matchedWith }) => {
    const roomId = [userId, matchedWith].sort().join("-");
    socket.join(roomId);
    console.log(`User ${userId} joined room: ${roomId}`);
  });

  // Handle messages
  socket.on("send-message", async ({ roomId, message, messageType, senderId }) => {
    console.log(`Message in room ${roomId}:`, message);
    io.to(roomId).emit("receive-message", { message, messageType, senderId }); // Broadcast to the room

    // Save message to Firestore
    const chatRef = db.collection("chats").doc(roomId); // Use roomId as chat_id
    const messageRef = chatRef.collection("messages").doc(uuidv4()); // Auto-generated document ID for messages

    await messageRef.set({
      sender_id: senderId,
      chat_id: roomId,
      message_type: messageType,
      message_content: message,
      timestamp: new Date().toISOString(),
    });
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
