module.exports = {
	/**
	 * 用這個一定有被BAN的風險，請勿使用主帳號登入！
	 * 帳號、密碼、帳號類型（google / ptc），可輸入多組
	 * 範例：
	 * account:[
	 * 	{username: "你的帳號A", password: "帳號A的密碼", provider: "google"},
	 * 	{username: "你的帳號B", password: "帳號B的密碼", provider: "google"},
	 * 	{username: "你的帳號C", password: "帳號C的密碼", provider: "ptc"}
	 * ]
	 */
	account: [
		{username: "你的帳號@gmail.com", password: "你的密碼", provider: "google"}
	],

	/**
	 * 找 BotFather 建立機器人後可取得
	 * 範例：
	 * telegramBotToken: "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw",
	 */
    telegramBotToken: "改為你的token",

    /**
     * 機器人模式（適合個人使用），去掉引號填入 null
     * telegramChannelID: null,
     * 
     * 廣播頻道模式，填入含@之群組或頻道ID
     * telegramChannelID: "@ChannelID",
     */
    telegramChannelID: "@你的ChannelID",

    // 巡邏中心位置
    initCenterLocation: {
		latitude: 25.0339031,
		longitude: 121.5623212
	},

	// 搜尋範圍大約是這個數字*100公尺，設越大要找越久
	searchSteps: 2,

	// 搜尋延遲
	searchDelay: 1000,

	/**
	 * 寶可夢黑名單，設定後不會通知，編號可參考 pokemon_name.js
	 * 範例：
	 * blacklist: [1, 2, 3, 4, 5, 65, 75, 102]
	 */
	blacklist: []
};