import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

// Initialize Express
const app = express();
app.use(cors());

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
  socket.on("send-message", ({ roomId, message }) => {
    console.log(`Message in room ${roomId}:`, message);
    io.to(roomId).emit("receive-message", message); // Broadcast to the room
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
