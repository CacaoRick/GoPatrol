module.exports = {
	/**
	 * 帳號、密碼、帳號類型（google / ptc）
	 * 用這個一定有被BAN的風險，請勿使用主帳號登入！
	 * 可輸入多組，格式參考以下範例：
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
	 * 機器人 Token
	 * 請用 Telegram 找 @BotFather 建立機器人後可取得
	 * 範例：
	 * telegramBotToken: "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw",
	 */
	telegramBotToken: "改為你的token",

	/**
	 * 管理者名單
	 * 只有管理者可以直接對機器人使用指令，以免路人亂加你機器人好友
	 * 填入使用者名稱，可設定多個使用者為管理者（注意，這裡不須@）
	 * telegramAdminUsername: ["AdminUser1", "AdminUser2"], 
	 */
	telegramAdminUsernames: ["UserName"],

	/**
     * 機器人模式（適合個人與群組使用），去掉引號填入 null
     * telegramChannelID: null,
     * 
     * 廣播頻道模式，填入含@之頻道ID
     * telegramChannelID: "@ChannelID",
     */
    telegramChannelID: "@你的ChannelID",

	/**
	 * 巡邏中心位置
	 * latitude: 緯度
	 * longitude: 經度
	 * 可利用 google map 等工具查詢想要的位置，網址中會有緯度與精度可以複製來用
	 */
	initCenterLocation: {
		latitude: 25.0339031,
		longitude: 121.5623212
	},

	/**
	 * 搜尋範圍
	 * 範圍大約是這個數字*100公尺為半徑，設越大要找越久
	 * 可設定更多帳號來減少搜尋時間，但同IP用太多帳號會被 BAN IP
	 */
	searchSteps: 2,

	/**
	 * 搜尋延遲
	 * 移動後停留在一個位置的時間，若 searchSteps 為 1 可以設為 0
	 * searchSteps > 1 建議要設定 1000 豪秒以上，不然有些寶可夢還沒被發現你就跑走了
	 */
	searchDelay: 1000,

	/**
	 * 寶可夢黑名單
	 * 設定後不會通知，編號可參考 pokemon_name.js
	 * 範例：blacklist: [10, 13, 16, 19]
	 */
	blacklist: []
};