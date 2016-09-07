'use strict';
const NodeTelegramBotAPI = require("node-telegram-bot-api");

// 為 TelegramBot 加入 sendVenue 功能
class TelegramBot extends NodeTelegramBotAPI {
	constructor(token, options = {}) {
		super(token, options);
	}

	sendVenue(chatId, latitude, longitude, title, address, form = {}) {
		form.chat_id = chatId;
		form.latitude = latitude;
		form.longitude = longitude;
		form.title = title;
		form.address = address;
		return this._request('sendVenue', { form: form });
	}
}

module.exports = TelegramBot;