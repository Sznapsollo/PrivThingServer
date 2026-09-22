const express = require("express");
const path = require("path");

const config = require('../config.json');

class Server {
  constructor() {
    this.app = express();
    this.port = config.port;
    this.canonicalHost = config.canonicalHost;
    this.paths = {
      actions: "/actions",
    };

    this.middlewares();
    this.routes();
  }

  middlewares() {
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ limit: "50mb", extended: true }));

    if (this.canonicalHost) {
      this.app.set("trust proxy", true);
      this.app.use((req, res, next) => this.toCanonicalHost(req, res, next));
    }

    this.app.get("/index.html", (req, res) => res.redirect(301, "/"));

    this.app.use(
      express.static(path.join(__dirname, "../client/build"))
    );
  }

  toCanonicalHost(req, res, next) {
    const host = (req.headers.host || "").toLowerCase();
    const forwardedProto = req.headers["x-forwarded-proto"];
    const wrongHost = host !== this.canonicalHost.toLowerCase();
    const wrongProtocol = forwardedProto !== undefined && req.protocol !== "https";

    if (!wrongHost && !wrongProtocol) {
      return next();
    }

    res.redirect(301, "https://" + this.canonicalHost + req.originalUrl);
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
