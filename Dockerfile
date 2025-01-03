# Use an official Node.js runtime as the base image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /src

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install app dependencies
RUN npm install

# Bundle the app source code inside the Docker image
COPY . .

# Build the TypeScript code
RUN npm run build

# Specify the command to run when the container starts
CMD [ "npm", "start" ]
