const proj4 = require("proj4");

// UTMK 좌표계 정의
proj4.defs(
  "UTMK",
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs"
);

function convertUTMKtoWGS84(utmkX, utmkY) {
  // UTMK -> WGS84 변환
  const [longitude, latitude] = proj4("UTMK", "WGS84", [
    parseFloat(utmkX),
    parseFloat(utmkY),
  ]);

  return {
    latitude,
    longitude,
  };
}
