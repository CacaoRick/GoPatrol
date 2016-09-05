'use strict';
var express = require("express");
var open = require("open");
var app = express();
var config = {};
try {
	config = require("./config.json");
} catch(e) {
	config.port = 3000;
	console.log("找不到 config.json，將以 port 3000 開啟設定頁面");
}

app.use("/js",  express.static(__dirname + '/js'));
app.use("/css",  express.static(__dirname + '/css'));
app.use("/fonts", express.static(__dirname + '/fonts'));

app.get("/", function (req, res) {
  res.sendFile("setting.html", {"root": __dirname});
});

app.get("/config.json", function (req, res) {
	res.sendFile("config.json", {"root": __dirname});
});

app.listen(config.port, function () {
	open("http://localhost:" + config.port);
});