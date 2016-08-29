'use strict';
const config = require("./config.js");
const pokemonNames = require("./pokemon_names.js");
const EventEmitter = require("events");
const request = require('request');
const Pokespotter = require("pokespotter");
const TelegramBot = require("node-telegram-bot-api");

// 為 TelegramBot 加入 sendVenue 功能
class TelegramBotWithVenus extends TelegramBot {
	constructor(token, options = {}) {
		super(token, options);
	}

	sendVenue(chatId, latitude, longitude, title, address, form = {}) {
		form.chat_id = chatId;
		form.latitude = latitude;
		form.longitude = longitude;
		form.title = title;
		form.address = address;
		return this._request('sendVenue', { form });
	}
}

const event = new EventEmitter();
var telegramBot = new TelegramBotWithVenus(config.telegramBotToken, { polling: true });
var pokespotter = Pokespotter(config.account);

var telegramAdminUsernames = config.telegramAdminUsernames;	// 管理員名單
var blacklist = config.blacklist;	// 寶可夢黑名單
var centerLocation = config.initCenterLocation;	// 搜尋中心位置
var spotterOptional = {
	steps: config.searchSteps,			// 搜尋範圍
	requestDelay: config.searchDelay,	// 搜尋延遲
	currentTime: Date.now()
}

var isPatrolling = false;	// 巡邏執行狀態
var pokemons = [];			// 儲存的寶可夢
var activeChatIDs = [];		// 啟動中的 Telegram ChatID

// 巡邏
event.on("patrol", function() {
	// 執行 pokespotter 尋找附近寶可夢
	spotterOptional.currentTime = Date.now();
	console.log("------------------------- 開始巡邏 " + getHHMMSS(spotterOptional.currentTime) + " -------------------------");
	pokespotter.get(centerLocation, spotterOptional).then(function(nearbyPokemons) {

		//console.log("找到 #", np.pokemonId, pokemonNames[np.pokemonId], np.spawnPointId, getHHMMSS(np.expirationTime));
		var newPokemonCount = 0;
		// 比對每隻發現的將新發現的寶可夢儲存至 pokemons
		nearbyPokemons.forEach(function(np) {
			var isNeedSave = true;
			
			if (blacklist.indexOf(np.pokemonId) >= 0) {
				// 找到黑名單，不儲存
				isNeedSave = false;
			} else {
				// 不在黑名單中，尋找是否已儲存
				pokemons.forEach(function(p) {
					if (np.spawnPointId == p.spawnPointId && np.pokemonId == p.pokemonId) {
						// 已存在，不儲存
						isNeedSave = false;
					}
				});
			}

			if (isNeedSave) {
				np.isInformed = false;
				pokemons.push(np);
				console.log("發現 #", np.pokemonId, pokemonNames[np.pokemonId], np.spawnPointId, getHHMMSS(np.expirationTime));
				newPokemonCount++;
			}
		});

		console.log("本次巡邏發現 " + nearbyPokemons.length + " 隻，新增 " + newPokemonCount + " 隻");

		// 檢查 pokemons 中的每隻寶可夢剩餘時間
		event.emit("checkLastTime");
	}).catch(function(err) {
		console.error("錯誤，將在 10 秒後重新啟動");
		console.error(err);
		pokespotter = null;
		
		setTimeout(function() {
			pokespotter = Pokespotter(config.account);
			event.emit("patrol");	
		}, 10000);
	});
});

// 檢查 pokemons 中的每隻寶可夢剩餘時間，若未到期且尚未通知則執行通知，若到期則刪除
event.on("checkLastTime", function() {
	for (var i = pokemons.length - 1; i >= 0; i--) {
		var lastTime = getLastTime(pokemons[i].expirationTime);
		if (lastTime > 0) {
			// 尚未結束，確認是否未通知
			if (!pokemons[i].isInformed) {
				// 尚未通知，執行通知
				event.emit("informToActiveUsers", pokemons[i], lastTime);
				pokemons[i].isInformed = true;
			}
		} else {
			// 已結束，刪除
			pokemons.splice(i, 1);
		}
	}

	// 判斷是否還有人在使用，有的話繼續下一次巡邏，否則不再觸發巡邏
	doNextPatrol();
});

// 將寶可夢通知給所有啟動中的使用者
event.on("informToActiveUsers", function(pokemon, lastTime) {
	for (var i = 0; i < activeChatIDs.length; i++) {
		sendPokemon(activeChatIDs[i], pokemon, lastTime);
	}
});

// 畫地圖，傳給下指令者
event.on("getmap", function(chatId) {
	if (pokemons.length > 0) {
		telegramBot.sendMessage(chatId, "地圖製作中，請稍候...");
		var mapUrl = Pokespotter.getMapsUrl(centerLocation, pokemons, "512x512");

		// 將地圖圖檔下載傳給使用者
		request({url:mapUrl, encoding:null}, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var imageBuffer = Buffer.from(body);
				// 將地圖傳給使用者
				telegramBot.sendPhoto(chatId, imageBuffer);

				var message = "";
				var index = 1;
				pokemons.forEach(function(p) {
					var lastTime = getLastTime(p.expirationTime);
					if (lastTime > 0) {
						message = message + "[" + index + "] #" + p.pokemonId + " " + pokemonNames[p.pokemonId] + 
						" 剩餘:" + getMMSS(lastTime) + " 結束:" + getHHMMSS(p.expirationTime) + "\n";	
					} else {
						message = message + "[" + index + "] #" + p.pokemonId + " " + pokemonNames[p.pokemonId] + 
						" 已結束:" + getHHMMSS(p.expirationTime) + "\n";	
					}
					
					index++;
				});

				// 傳送寶可夢編號和資訊
				telegramBot.sendMessage(chatId, message);
			} else {
				// 請求失敗
				telegramBot.sendMessage(chatId, "地圖圖檔請求失敗(狀態：" + response.statusCode + ")");
				console.log(error);
			}
		});
	} else {
		telegramBot.sendMessage(chatId, "目前無資料");
	}
});

// 檢查是否為頻道模式
const channelID = config.telegramChannelID;
if (channelID != null) {
	console.log("廣播模式啟動");
	// 將頻道ID存入 activeChatIDs
	activeChatIDs = [channelID];
	// 觸發第一次巡邏
	event.emit("patrol");
	// 更改執行狀態
	isPatrolling = true;
} else {
	console.log("機器人模式啟動，請在 Telegram 聊天中傳送指令");
	// Bot 收到訊息，處理指令
	telegramBot.on("message", function(msg) {
		var chatId = msg.chat.id;
		var isAdmin = telegramAdminUsernames.indexOf(msg.from.username) >= 0;
		var isInActiveChatID = activeChatIDs.indexOf(chatId) >= 0;
		var command = "";
		if (typeof msg.text !== "undefined") {
			command = msg.text.split("@")[0];
			// 發送說明
			if (command == "/help") {
				telegramBot.sendMessage(
					chatId,
					"說明：\n" +
					"以指定的位置為中心進行巡邏（範圍約半徑100多公尺），將遇到的寶可夢通知給使用者\n" +
					"一般指令：\n" +
					"/getmap 取得附近寶可夢地圖\n\n" +
					"管理員專用：\n" + 
					"/help 查看說明\n" +
					"/start 開始巡邏\n" +
					"/stop 停止巡邏\n" +
					"傳送位置訊息可更改巡邏中心位置"
				);
			}

			// 登錄chatId，若巡邏為執行則觸發巡邏
			if (command == "/start" && isAdmin) {
				// 若 chatId 不在清單中，加進去
				if (!isInActiveChatID) {
					activeChatIDs.push(chatId);
					console.log("新增使用者：" + chatId + "，目前使用者：" + activeChatIDs);
				}

				// 若原本沒在執行中，觸發巡邏並更改執行狀態
				if (!isPatrolling) {
					// 觸發第一次巡邏
					event.emit("patrol");
					// 更改執行狀態
					isPatrolling = true;
					telegramBot.sendMessage(chatId, "管理員啟動通知");
				} else {
					// 本來就在巡邏了
					telegramBot.sendMessage(chatId, "通知已進行中");
				}
			}

			// 從清單中移除chatId，該chatId將不再被通知
			if (command == "/stop" && isAdmin) {
				// 從 activeChatIDs 中移除
				var index = activeChatIDs.indexOf(chatId);
				if (index >= 0) {
					activeChatIDs.splice(index, 1);
				}

				telegramBot.sendMessage(chatId, "管理員停止通知");
			}

			// 判斷有在ActiveChatID才能使用，才不會被路人亂加機器人好用亂用
			if (command == "/getmap" && isInActiveChatID) {
				// 取得附近寶可夢的地圖圖檔
				event.emit("getmap", chatId);
			}
		}
	});

	telegramBot.on("location", function(msg) {
		// 判斷是否為管理員
		if (telegramAdminUsernames.indexOf(msg.from.username) >= 0) {
			// 更改座標
			centerLocation = msg.location;
			// 通知
			telegramBot.sendMessage(msg.chat.id, "已更改巡邏中心位置");
		}
	});
}









function sendPokemon(chatId, pokemon, lastTime) {
	telegramBot.sendVenue(
		chatId,
		pokemon.latitude,
		pokemon.longitude,
		"#" + pokemon.pokemonId + " " + pokemonNames[pokemon.pokemonId] + " " + pokemon.distance + "m",
		"剩餘 " + getMMSS(lastTime) + " 結束 " + getHHMMSS(pokemon.expirationTime)
	);
}

// 判斷是否還有人在使用，有的話繼續下一次巡邏，否則不在觸發巡邏
function doNextPatrol() {
	if (activeChatIDs.length > 0) {
		// 觸發下一次巡邏
		event.emit("patrol");
	} else {
		// 更改執行狀態
		isPatrolling = false;
		console.log("無使用者，已停止巡邏");
	}
}

// 取得剩餘時間 timestamps，若為負數表示已結束
function getLastTime(endTime) {
	return endTime - Date.now();
}

// 取得 時:分:秒
function getHHMMSS(time) {
	var date = new Date(time);
	var hours = date.getHours();
	var minutes = "0" + date.getMinutes();
	var seconds = "0" + date.getSeconds();
	return hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
}

// 取得 分:秒
function getMMSS(time) {
	var date = new Date(time);
	var minutes = date.getMinutes();
	var seconds = "0" + date.getSeconds();
	return minutes + ':' + seconds.substr(-2);
}
