// Import the PrismaClient class from the @prisma/client package.
import { PrismaClient } from "@prisma/client";

// Declare a global variable for PrismaClient. This helps in reusing the same PrismaClient instance 
// across multiple modules, especially useful in a serverless environment to avoid excessive database connections.
declare global {
    var prisma: PrismaClient | undefined
};

// Create a new instance of PrismaClient if there isn't one already in the global scope. 
// This is essential to ensure only one instance of PrismaClient is created, which helps in 
// avoiding multiple database connections that can lead to performance issues.
const prismadb = globalThis.prisma || new PrismaClient();

// If the environment is not production, assign the created PrismaClient instance to the global scope. 
// This ensures that during development and testing, the same PrismaClient instance is reused across 
// hot-reloads, which is a common scenario in development with tools like Next.js.
if (process.env.NODE_ENV !== "production") globalThis.prisma = prismadb;

// Export the PrismaClient instance so it can be imported and used in other parts of the application.
export default prismadb;
