const words = require('random-words');
const { createServer } = require("http");
const { Server } = require("socket.io");
const { makeid } = require("./utils.js");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

let admins = {};

io.on("connection", (client) => {
  console.log("A client connected:", client.id);

  // 🆕 Initializes a new game
  const newgame = (clientname) => {
    client.username = clientname;
    client.speed = 0;
    client.correctness = 0;

    const roomid = makeid(5);
    client.join(roomid);
    admins[roomid] = client;

    playerjoined(roomid);
    client.emit("init", roomid);
  };

  // 🔗 Joins a game if valid code
  const joingame = (obj) => {
    client.username = obj.name;
    client.speed = 0;
    client.correctness = 0;

    if (!io.sockets.adapter.rooms.has(obj.code)) {
      client.emit("joinedroom", "false");
    } else {
      client.emit("joinedroom", "true");
      client.join(obj.code);
      playerjoined(obj.code);
    }
  };

  // 📡 Receiving Client Calls
  client.on("newgame", newgame);
  client.on("joingame", joingame);

  // Sends random words to room
  client.on("sendwords", () => {
    const room = Array.from(client.rooms)[1];
    if (room) {
      io.to(room).emit("receivewords", words({ exactly: 100, maxLength: 5 }));
    }
  });

  // 🏁 Update players' progress
  client.on("correctwords", async (e) => {
    const [correctwords, seconds, charcount, roomcode] = e;

    let clientsInRoom = await io.in(roomcode).fetchSockets();
    client.speed = seconds == 60 ? 0 : Math.floor((charcount / 5 * 60) / (60 - seconds));
    client.correctness = correctwords;

    sort(clientsInRoom);

    let list = [];
    let speedlist = [];
    let correctlist = [];

    for (let i in clientsInRoom) {
      list.push(clientsInRoom[i].username);
      speedlist.push(clientsInRoom[i].speed);
      correctlist.push(clientsInRoom[i].correctness);
    }

    io.to(roomcode).emit("players", { player: list, speed: speedlist, correctwords: correctlist });

    if (seconds === 0) io.to(roomcode).emit("gameover");
  });

  // ❌ Handle disconnection
  client.on("disconnect", () => {
    console.log("Client disconnected:", client.id);
    for (let room in admins) {
      if (admins[room].id === client.id) {
        delete admins[room];
      }
    }
  });
});

httpServer.listen(process.env.PORT || 5000, () => {
  console.log("✅ Server running on port", process.env.PORT || 5000);
});

// 👥 Function when a player joins a room
async function playerjoined(roomName) {
  const clientsInRoom = await io.in(roomName).fetchSockets();

  if (clientsInRoom.length === 2 && admins[roomName]) {
    admins[roomName].emit("showgamebutton");
  }

  const list = clientsInRoom.map(c => c.username);
  io.to(roomName).emit("players", { player: list });
}

// 🔢 Sort by correctness (descending)
function sort(arr) {
  arr.sort((a, b) => b.correctness - a.correctness);
}
