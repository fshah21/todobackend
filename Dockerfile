# Step 1: Use official Node.js image
FROM node:16

# Step 2: Set the working directory
WORKDIR /usr/src

# Step 3: Install dependencies
COPY package*.json ./
RUN npm install

# Step 4: Copy the rest of the application
COPY . .

# Step 5: Expose the port Cloud Run uses (8080 by default)
EXPOSE 8080

# Step 6: Set the start command
CMD ["npm", "start"]