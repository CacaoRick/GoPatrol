'use strict';
console.log("Go Patrol version:");
console.log("v1.0.2");
const config = require("./config.js");
const pokemonNames = require("./pokemon_names.js");
const TelegramBot = require("./telegramBot.js")
const EventEmitter = require("events");
const request = require('request');
const Pokespotter = require("pokespotter");
const Jimp = require("jimp");

const event = new EventEmitter();
const telegramBot = new TelegramBot(config.telegramBotToken, { polling: true });
const initDate = new Date();
const fifteenMinutes = 900000;
const iconhost = "http://gopatrol.ass.tw/pixel_icons/";
var telegramAdminUsernames = config.telegramAdminUsernames;	// 管理員名單
var centerLocation = config.initCenterLocation;	// 搜尋中心位置
var whitelist = config.whitelist;	// 寶可夢白名單
var blacklist = config.blacklist;	// 寶可夢黑名單
var spotterOptional = {
	steps: config.searchSteps,			// 搜尋範圍
	requestDelay: config.searchDelay * 1000,	// 搜尋延遲
	currentTime: initDate
}
const debug = config.debug;
if (debug) {
	console.log("debug on.")
}
var mapBuffer;
var pokespotters = [];			// 儲存 Spotter 用
pokespotters[0] = Pokespotter(config.account);		// 建立第一個 Spotter
pokespotters[0].runCount = 0;	// 記錄 Spotter 執行次數，用來確認是不是卡住了
var runningSpotterId = 0;		// 記錄目前 Spotter 的 Id，用來確認 Spotter 存活狀態
var isWattingRestart = false;	// 正在重啟中，用來確保不要重複重啟
var isPatrolling = false;		// 巡邏執行狀態
var pokemons = [];				// 儲存的寶可夢
var activeChatIDs = [];			// 啟動中的 Telegram ChatID

// 巡邏
event.on("patrol", function(thisSpotterId) {
	console.log("---------------------------------------------------------------------------\n");
	if (debug) {
		console.log("on patrol event.");
	}

	// 防止巡邏卡住
	if (config.autoRestartTime != 0) {
		// 將 runCount 儲存為區域變數
		var runCount = pokespotters[thisSpotterId].runCount;
		// 計時開始，根據設定檔中的 autoRestartTime，時間到以後檢查執行狀態，若還在執行中就當作他卡住了
		setTimeout(function () {
			// 有在巡邏中才檢查
			if (isPatrolling) {
				if (debug) {
					console.log("====");
					console.log("on timeout " + config.autoRestartTime + " seconds, check spotter status.");
					console.log("chech SpotterId:" + thisSpotterId + " RunCount:" + runCount);
					console.log("now SpotterId:" + runningSpotterId + " RunCount:" + pokespotters[thisSpotterId].runCount);
				}
				// 確認還沒死掉，死了就不管了
				if (thisSpotterId == runningSpotterId) {
					if (debug) {
						console.log("spotter is alive.");
					}
					// 檢查是否還在同一次執行
					if (runCount == pokespotters[thisSpotterId].runCount) {
						if (debug) {
							console.log("spotter is blocking.");
							console.log("====\n");
						}
						// 是，懷疑他卡住了
						// 若不在重啟中狀態，可以重新啟動。若使已再重啟就不用管了等他啟動就好
						if (!isWattingRestart) {
							console.log("[" + getHHMMSS(Date.now()) + "] 過了" + config.autoRestartTime + "秒還沒找完，好像卡住了？");
							restart();
						}	
					} else if (debug) {
						console.log("spotter not blocking.");
						console.log("====\n");
					}
				} else if (debug) {
					console.log("spotter is dead.");
					console.log("====\n");
				}
			}
		}, config.autoRestartTime * 1000);
	}

	// 開始巡邏
	spotterOptional.currentTime = Date.now();
	
	if (debug) {
		console.log("thisSpotterId:" + thisSpotterId);
		console.log("runningSpotterId:" + runningSpotterId);
		console.log("thisSpotter runcount:" + pokespotters[thisSpotterId].runCount + "\n");
	}

	console.log("["+ getHHMMSS(spotterOptional.currentTime) + "] 開始巡邏...");
	pokespotters[thisSpotterId].get(centerLocation, spotterOptional).then(function(nearbyPokemons) {
		// 有跑進來表示沒卡住，把執行次數+1
		pokespotters[thisSpotterId].runCount++;

		var newPokemonCount = 0;
		// 比對每隻發現的將新發現的寶可夢儲存至 pokemons
		nearbyPokemons.forEach(function(np) {
			var isNeedSave = true;
			
			if (whitelist.length == 0 || whitelist.indexOf(np.pokemonId) >= 0) {
				// 白名單未設定，或是在白名單中有找到，檢查黑名單
				if (blacklist.indexOf(np.pokemonId) < 0) {
					// 不在黑名單，檢查是否重複
					pokemons.forEach(function(p) {
						if (np.spawnPointId == p.spawnPointId && np.pokemonId == p.pokemonId) {
							// 已存在，不儲存
							isNeedSave = false;
						}
					});
				} else {
					isNeedSave = false;
				}
			} else {
				// 被白名單過濾
				isNeedSave = false;
			}
			
			// 檢查完畢，確認是否需儲存
			if (isNeedSave) {
				// 要儲存，先幫他加上通知狀態，設為false
				np.isInformed = false;
				pokemons.push(np);
				console.log("新增 #" + np.pokemonId, pokemonNames[np.pokemonId], np.spawnPointId, getHHMMSS(np.expirationTime));
				newPokemonCount++;
			}
		});

		// 確認 Spotter 沒死，且為執行中才送訊息
		if (thisSpotterId == runningSpotterId && isPatrolling) {
			console.log("本次巡邏發現 " + nearbyPokemons.length + " 隻，新增 " + newPokemonCount + " 隻，費時 " + getMMSS(Date.now() - spotterOptional.currentTime));
			// 檢查 pokemons 中的每隻寶可夢剩餘時間
			event.emit("checkLastTime", thisSpotterId);
		}

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
	if (debug) {
		console.log("on checkLastTime event.");
	}

	// 檢查ID正確才繼續跑，否則代表這個 Spotter 已經死了
	if (thisSpotterId == runningSpotterId) {
		console.log("[" + getHHMMSS(Date.now()) + "] 開始檢查結束時間並進行通知...\n");
		for (var i = pokemons.length - 1; i >= 0; i--) {
			var lastTime = getLastTime(pokemons[i].expirationTime);
			if (lastTime > 0 && lastTime <= fifteenMinutes) {
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
	if (debug) {
		console.log("on informToActiveUsers event.");
	}
	for (var i = 0; i < activeChatIDs.length; i++) {
		sendPokemon(activeChatIDs[i], pokemon, lastTime);
	}
});

// 畫地圖，傳給下指令者
event.on("getmap", function(chatId) {
	if (debug) {
		console.log("on getmap event.");
	}

	if (pokemons.length > 0) {
		telegramBot.sendMessage(chatId, "地圖製作中，請稍候...");
		// 照ID排列
		var mapPokemon = pokemons;
		mapPokemon.sort(function(a, b) {
			return a.pokemonId - b.pokemonId;
		});

		var mapcenter = centerLocation.latitude + "," + centerLocation.longitude;

		// Build URL
		var zoom = 17 - Math.ceil(spotterOptional.steps / 3);
		var size = "640x640";
		var TransparentStyle = "&style=feature:all|visibility:off";	// 取透明底圖用
		// 不透明地圖 URL
		var mapUrlNormal = "http://maps.google.com/maps/api/staticmap?center=" + mapcenter +
		"&zoom=" + zoom + "&size=" + size + "&maptype=roadmap&format=png&visual_refresh=true";
		// 透明地圖 URL
		var mapUrlTransparent = mapUrlNormal + TransparentStyle;

		// Build Markers (message 順便)
		var message = "";
		var typeCount = 0;
		var prePokemonId = 0;
		var markers = [];
		markers[0] = "&markers=size:small%7Ccolor:0x0080ff%7Clabel:%7C" + mapcenter;	// 畫出中心
		var markersIdx = 0;
		mapPokemon.forEach(function(p) {
			var lastTime = getLastTime(p.expirationTime);
			if (lastTime > 0 && lastTime <= fifteenMinutes) {
				if (typeCount % 5 == 0) {
					if (prePokemonId == 0) {
						// 第一次執行，不換 markersIdx
					} else {
						// 滿五種，換 markersIdx
						markersIdx++;
						markers[markersIdx] = "";
					}
				}
				if (p.pokemonId > prePokemonId) {
					// 新 Type
					typeCount++;
					prePokemonId = p.pokemonId;
				}

				// 續編 markers
				markers[markersIdx] = markers[markersIdx] + "&markers=icon:" + iconhost + p.pokemonId + ".png%7Cshadow:false%7C" + p.latitude + "," + p.longitude;

				// 續編 message
				message = message + "#" + p.pokemonId + " #" + pokemonNames[p.pokemonId] + 
					"｜" + p.distance + "m｜-" + getMMSS(lastTime) + "｜" + getHHMMSS(p.expirationTime) + "\n";
			}
		});

		// 準備靜態地圖 url
		var mapurls = [];
		var oldMapUrl = mapUrlNormal;
		markers.forEach(function(m, idx) {
			if (idx == 0) {
				mapurls.push(mapUrlNormal + m);
			} else {
				mapurls.push(mapUrlTransparent + m);
			}
			oldMapUrl = oldMapUrl + m;
		});
		if (debug) {
			telegramBot.sendMessage(chatId, oldMapUrl);	
		}
		
		// 處理每張地圖
		var mapImage = null;
		var jimpImages = [];
		var processCount = 0;
		mapurls.forEach(function(url, idx) {
			if (idx == 0) {
				Jimp.read(url, saveBase);	// 底圖另外存在 mapImage
			} else {
				Jimp.read(url, processImage);
			}
		});

		// 儲存有底圖的地圖影像到 mapImage
		function saveBase(err, image) {
			if (err) {
				console.log("影像處理失敗");
				throw err;
			} else {
				mapImage = image;
				processCount++;
				if (processCount == mapurls.length) {
					// 全部處理完畢，開始合成地圖並傳送
					sendMap();
				}
			}
		}
		
		// 儲存地圖影像到 jimpImages[]
		function processImage(err, image) {
			if (err) {
				console.log("影像處理失敗");
				throw err;
			} else {
				jimpImages.push(image);
				processCount++;
				if (processCount == mapurls.length) {
					// 全部處理完畢，開始合成地圖並傳送
					sendMap();
				}
			}
		}

		// 全部處理完畢，開始合成地圖並傳送
		function sendMap() {
			jimpImages.forEach(function(img, idx) {
				mapImage.composite(img, 0, 0);
			});

			telegramBot.sendMessage(chatId, message);
			mapImage.getBuffer(Jimp.MIME_PNG, function(err, buffer) {
				telegramBot.sendPhoto(chatId, buffer);
			});
		}
	} else {
		telegramBot.sendMessage(chatId, "目前無資料");
	}
});

if (config.telegramChannelID != null) {
	console.log("廣播模式啟動\n");
	telegramBot.sendMessage(config.telegramChannelID, "伺服器啟動，開始巡邏與通知");

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
		if (debug) {
			console.log("on message event.");
			console.log(msg);
		}
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
					"以指定位置為中心進行巡邏，尋找附近的寶可夢並利用 Telegram bot 送出通知給使用者、頻道或群組。\n\n" +
					"一般指令：\n" +
					"/getmap 取得附近寶可夢地圖\n\n" +
					"管理員專用：\n" + 
					"/help 查看說明\n" +
					"/run 開始巡邏和通知\n" +
					"/stop 停止巡邏和通知\n" +
					"/restart 強制重啟巡邏\n" +
					"/status 取得伺服器狀態\n" +
					"傳送位置訊息可更改巡邏中心位置\n\n" +
					"首頁：https://github.com/CacaoRick/GoPatrol"
				);
			}

			// 登錄chatId，若巡邏未執行則觸發巡邏
			if (command == "/run" && isAdmin) {
				console.log(msg.from.username + ": " + command);
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
				console.log(msg.from.username + ": " + command);
				// 從 activeChatIDs 中移除
				var index = activeChatIDs.indexOf(chatId);
				if (index >= 0) {
					activeChatIDs.splice(index, 1);
					telegramBot.sendMessage(chatId, "管理員已停止通知");
				}
				if (activeChatIDs.length == 0) {
					// 沒人在收通知了，停止巡邏
					isPatrolling = false;
					telegramBot.sendMessage(chatId, "巡邏已停止");
					console.log("無使用者，已停止巡邏");
				}
			}

			// 強制重啟
			if (command == "/restart" && isAdmin) {
				console.log(msg.from.username + ": " + command);
				if (!isPatrolling) {
					// 巡邏未啟動
					telegramBot.sendMessage(chatId, "巡邏尚未啟動");
				} else if (isWattingRestart) {
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
					"伺服器啟動日期：" + initDate.getFullYear() + "-" + (initDate.getMonth() + 1) + "-" + initDate.getDate() + " " + getHHMMSS(initDate)
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
			// 清空 pokemons
			
			// 更改座標
			centerLocation = msg.location;
			// 通知
			telegramBot.sendMessage(msg.chat.id, "已更改巡邏中心位置");
		}
	});
}

// 判斷是否還有人在使用，有的話繼續下一次巡邏，否則不在觸發巡邏
function prepareNextPatrol(thisSpotterId) {
	// 確認還有人在用
	if (activeChatIDs.length > 0 && isPatrolling) {
		if (thisSpotterId == runningSpotterId) {
			// Spotter 沒死掉 觸發下一次巡邏
			event.emit("patrol", runningSpotterId);	
		} else {
			console.log("thisSpotterId = " + thisSpotterId);
			console.log("runningSpotterId = " + runningSpotterId);
		}
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
