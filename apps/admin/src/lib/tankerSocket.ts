import { io, Socket } from "socket.io-client";

// Connect to tanker Socket.IO via Vite proxy path /tanker-socket
export function createTankerSocket(): Socket {
  return io("/", {
    path: "/tanker-socket/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: false,
  });
}
