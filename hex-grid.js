const geolib = require("geolib");

/**
 * center = {latitude, longitude}
 */
function computePatrolPoints(center, steps) {
	const offset = 121.24;  	// 每個點之間的距離
	const originBearing = 240;	// 從原點到下一個 step 第一點的轉角
	let locations = [];     	// 計算出來的位置
	let bearingDeg = 0;			// 目前轉角
	let nowLocation = {			// 目前位置
		latitude: center.latitude,
		longitude: center.longitude
	}
	locations.push(nowLocation); 	// 先把中心存進去
	
	// nowStep 目前在做第幾 step
	for (let nowStep = 1; nowStep < steps; nowStep++) {
		// 重設角度
		bearingDeg = 0;
		// 往下一個 step 移動
		nowLocation = geolib.computeDestinationPoint(nowLocation, offset, originBearing);
		// nowSide 目前在第幾邊
		for (let nowSide = 0; nowSide < 6; nowSide++) {
			// nowPoint 目前在這邊的第幾個點
			for (let nowPoint = 0; nowPoint < nowStep; nowPoint++) {
				// 移到下一個點
				nowLocation = geolib.computeDestinationPoint(nowLocation, offset, bearingDeg);
				// 將現在位置存入 locations
				locations.push(nowLocation);
			}
			// 轉向下一角度
			bearingDeg += 60;
		}
	}

	return locations;
}

module.exports = {
	computePatrolPoints: computePatrolPoints
}