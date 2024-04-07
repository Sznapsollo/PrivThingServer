const express = require("express");
const cors = require("cors");
const path = require("path");

const config = require('../config.json');

class Server {
  constructor() {
    this.app = express();
    this.port = config.port;
    this.paths = {
      actions: "/actions",
    };

    this.middlewares();
    this.routes();
  }

  middlewares() {
    this.app.use(cors());
    this.app.use(express.json());

    this.app.use(
      express.static(path.join(__dirname, "../client/build"))
    );
  }

  routes() {
    this.app.use(this.paths.actions, require("../routes/actions"));
    this.app.get("*", (req, res) => {
      res.sendFile(
        path.join(__dirname, "../client/build/index.html")
      );
    });
  }

  listen() {
    this.app.listen(this.port, 'localhost', () => {
      console.log("Server running on port: ", this.port);
    });
  }
}

module.exports = Server;
