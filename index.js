'use strict';
const config = require("./config.js");
const pokemonNames = require("./pokemon_names.js");
const TelegramBot = require("./telegramBot.js")
const EventEmitter = require("events");
const request = require('request');
const Pokespotter = require("pokespotter");

const event = new EventEmitter();
const telegramBot = new TelegramBot(config.telegramBotToken, { polling: true });
const initDate = new Date();
var telegramAdminUsernames = config.telegramAdminUsernames;	// 管理員名單
var centerLocation = config.initCenterLocation;	// 搜尋中心位置
var blacklist = config.blacklist;	// 寶可夢黑名單
var spotterOptional = {
	steps: config.searchSteps,			// 搜尋範圍
	requestDelay: config.searchDelay * 1000,	// 搜尋延遲
	currentTime: initDate
}

var pokespotters = [];			// 儲存 Spotter 用
pokespotters[0] = Pokespotter(config.account);		// 建立第一個 Spotter
pokespotters[0].runCount = 0;	// 記錄 Spotter 執行次數，用來確認是不是卡住了
var runningSpotterId = 0;		// 記錄目前 Spotter 的 Id，用來確認 Spotter 存活狀態
var isWattingRestart = false;	// 正在重啟中，用來確保不要重複重啟
var isPatrolling = false;		// 巡邏執行狀態
var pokemons = [];				// 儲存的寶可夢
var activeChatIDs = [];			// 啟動中的 Telegram ChatID

if (config.telegramChannelID != null) {
	console.log("廣播模式啟動\n");
	// 將頻道ID存入 activeChatIDs
	activeChatIDs = [config.telegramChannelID];
	// 觸發第一次巡邏
	event.emit("patrol", runningSpotterId);
	// 更改執行狀態
	isPatrolling = true;
} else {
	console.log("機器人模式啟動，請在 Telegram 聊天中傳送指令\n");
	// Bot 收到訊息，處理指令
	telegramBot.on("message", function(msg) {
		var chatId = msg.chat.id;	// chat.id 可能會是群組ID或個人ID
		var isAdmin = telegramAdminUsernames.indexOf(msg.from.username) >= 0;	// 傳訊者是否為管理員
		var isInActiveChatID = activeChatIDs.indexOf(chatId) >= 0;	// chatId是否在 activeChatIDs 中，用來判斷是不是路人亂+BOT
		var command = "";	// 用來儲存指令

		// 先確定有文字，因為在群組模式有人進出也會有 message 但是沒有文字，text 會變成 undefined
		if (typeof msg.text !== "undefined") {
			command = msg.text.split("@")[0];	// 若在頻道中按下BOT傳送的指令後面會多出@BotId，用split切開取最前面才會是指令
			
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
					"/run 開始巡邏\n" +
					"/stop 停止巡邏\n" +
					"傳送位置訊息可更改巡邏中心位置"
				);
			}

			// 登錄chatId，若巡邏未執行則觸發巡邏
			if (command == "/run" && isAdmin) {
				// 若 chatId 不在清單中，加進去
				if (!isInActiveChatID) {
					activeChatIDs.push(chatId);
					telegramBot.sendMessage(chatId, "管理員已啟動通知");
				}

				// 若原本沒在執行中，觸發巡邏並更改執行狀態
				if (!isPatrolling) {
					// 觸發第一次巡邏
					event.emit("patrol", runningSpotterId);
					// 更改執行狀態
					isPatrolling = true;
					telegramBot.sendMessage(chatId, "開始巡邏");
				} else {
					// 本來就在巡邏了
					telegramBot.sendMessage(chatId, "巡邏進行中");
				}
			}

			// 從清單中移除chatId，該chatId將不再被通知
			if (command == "/stop" && isAdmin) {
				// 從 activeChatIDs 中移除
				var index = activeChatIDs.indexOf(chatId);
				if (index >= 0) {
					activeChatIDs.splice(index, 1);
				}

				telegramBot.sendMessage(chatId, "管理員已停止通知");
			}

			// 強制重啟
			if (command == "/restart" && isAdmin) {
				if (isWattingRestart) {
					// 已經再重啟中了
					telegramBot.sendMessage(chatId, "正在重啟中");
				} else {
					// 不在重啟中狀態，可以重新啟動
					restart();
				}
			}

			// 接收狀態
			if (command == "/status" && isAdmin) {
				telegramBot.sendMessage(chatId,
					"伺服器狀態\n" +
					"巡邏中：" + isPatrolling + "\n" +
					"帳號數量：" + config.account.length + "\n" +
					"巡邏範圍：" + config.searchSteps * 100 + "m\n" +
					"巡邏重啟次數：" + runningSpotterId + "\n" +
					"伺服器啟動日期：" + initDate.getFullYear() + "-" + initDate.getMonth() + "-" + initDate.getDate() + " " + getHHMMSS(initDate)
				);

				telegramBot.sendVenue(chatId, centerLocation.latitude, centerLocation.longitude, "目前巡邏中心位置", "");
			}

			// 判斷有在 ActiveChatID 陣列中才能使用，才不會被路人亂+BOT亂用
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

// 巡邏
event.on("patrol", function(thisSpotterId) {

	// 防止巡邏卡住
	// 將 runCount 儲存為區域變數
	var runCount = pokespotters[thisSpotterId].runCount;
	// 計時開始，根據設定檔中的 autoRestartTime，時間到以後檢查執行狀態，若還在執行中就當作他卡住了
	setTimeout(function (thisSpotterId, runCount) {
		// 確認還沒死掉，死了就不管了
		if (thisSpotterId == runningSpotterId) {
			// 檢查是否還在同一次執行
			if (runCount == pokespotters[thisSpotterId].runCount) {
				// 是，懷疑他卡住了
				// 若不在重啟中狀態，可以重新啟動。若使已再重啟就不用管了等他啟動就好
				if (!isWattingRestart) {
					console.log(getHHMMSS(Date.now()) + " " + thisSpotterId + " 過了" + config.autoRestartTime + "秒，好像卡住了？執行重啟");
					restart();
				}	
			}	
		}
	}, config.autoRestartTime * 1000);


	// 開始巡邏
	spotterOptional.currentTime = Date.now();
	console.log("---------------------------------------------------------------------------\n");
	console.log("["+ getHHMMSS(spotterOptional.currentTime) + "] 開始巡邏...");
	pokespotters[thisSpotterId].get(centerLocation, spotterOptional).then(function(nearbyPokemons) {
		// 有跑進來表示沒卡住，把執行次數+1
		pokespotters[thisSpotterId].runCount++;

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
				console.log("新增 #" + np.pokemonId, pokemonNames[np.pokemonId], np.spawnPointId, getHHMMSS(np.expirationTime));
				newPokemonCount++;
			}
		});

		// 確認 Spotter 沒死才送訊息
		if (thisSpotterId == runningSpotterId) {
			console.log("本次巡邏發現 " + nearbyPokemons.length + " 隻，新增 " + newPokemonCount + " 隻");
		}

		// 檢查 pokemons 中的每隻寶可夢剩餘時間
		event.emit("checkLastTime", thisSpotterId);

	}).catch(function(err) {
		console.error(getHHMMSS(Date.now()) + " 遇到錯誤了...");
		console.error(err);

		// 不在重啟中狀態，可以重新啟動。若已再重啟中就不用管了等他啟動就好
		if (!isWattingRestart) {
			restart();
		}
	});
});

// 檢查 pokemons 中的每隻寶可夢剩餘時間，若未到期且尚未通知則執行通知，若到期則刪除
event.on("checkLastTime", function(thisSpotterId) {
	// 檢查ID正確才繼續跑，否則代表這個 Spotter 已經死了
	if (thisSpotterId == runningSpotterId) {
		console.log("[" + getHHMMSS(Date.now()) + "] 開始檢查結束時間並進行通知...\n");
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
		prepareNextPatrol(thisSpotterId);
	}
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
				console.log(getHHMMSS(Date.now()) + " /getmap (" + response.statusCode + ")地圖圖檔請求失敗...");
				console.log(error);
			}
		});
	} else {
		telegramBot.sendMessage(chatId, "目前無資料");
	}
});

// 判斷是否還有人在使用，有的話繼續下一次巡邏，否則不在觸發巡邏
function prepareNextPatrol(thisSpotterId) {
	// 確認還有人在用
	if (activeChatIDs.length > 0) {
		if (thisSpotterId == runningSpotterId) {
			// Spotter 沒死掉 觸發下一次巡邏
			event.emit("patrol", runningSpotterId);	
		} else {
			console.log("thisSpotterId = " + thisSpotterId);
			console.log("runningSpotterId = " + runningSpotterId);
		}
	} else {
		// 更改執行狀態
		isPatrolling = false;
		console.log("無使用者，已停止巡邏");
	}
}

// 遇到錯誤或呼叫 /restart 時使用
function restart() {
	isWattingRestart = true;	// 設為重啟中狀態，避免重複呼叫指令造成多個 Spotter 被啟動
	runningSpotterId = runningSpotterId + 1;	// 更新執行中的 Spotter Id
	pokespotters[runningSpotterId] = null;		// 捨棄舊的 Spotter

	console.log("10秒後重新開使巡邏");
	setTimeout(function() {
		// 建立下一個 Spotter
		pokespotters[runningSpotterId] = Pokespotter(config.account);
		pokespotters[runningSpotterId].runCount = 0;// 將執行次數歸零
		// 觸發巡邏
		event.emit("patrol", runningSpotterId);
		isWattingRestart = false;	// 取消啟動中狀態
	}, 10000);
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
