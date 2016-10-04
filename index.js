'use strict';
const packagejson = require('./package.json');
console.log(`Node v${process.versions.node} | GoPatrol v${packagejson.version}`);
if (parseInt(process.versions.node.charAt(0)) < "6") {
	console.log("請使用 Node v6.4.0 以上版本");
	process.exit("1");
}

const _ = require("lodash");
const Jimp = require("jimp");
const moment = require("moment");
const request = require('request');
const EventEmitter = require("events");
const Pokespotter = require("pokespotter");
const TelegramBot = require("node-telegram-bot-api");

