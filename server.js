const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const iconv = require("iconv-lite");

const app = express();
const port = 8080;

app.use(cors());

// 버스 도착 정보를 가져오는 함수
async function getBusArrivalInfo(
  stationId,
  stationName,
  routeId,
  routeNo,
  direction
) {
  try {
    // URL 인코딩 처리 (필요시)
    let encodedStationName = "";
    const buf = iconv.encode(stationName, "EUC-KR");
    for (let i = 0; i < buf.length; i++) {
      encodedStationName += "%" + buf[i].toString(16).toUpperCase();
    }

    const url = `https://businfo.daegu.go.kr/ba/route/rtbsarr.do?act=findByArr&bsId=${stationId}&routeId=${routeId}`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://businfo.daegu.go.kr/",
      },
    });

    const html = iconv.decode(response.data, "EUC-KR");
    const $ = cheerio.load(html);

    const arrivals = [];
    // 도착정보가 있는 영역을 ul#arrival_list 내부의 li 태그 대상으로 파싱합니다.
    $("ul#arrival_list li").each((_, element) => {
      const text = $(element).text().trim();
      if (text) {
        // 예: "삼성래미안1차건너 13 개소전 15 분" 형태로 되어있다고 가정
        const parts = text
          .split(/(\d+개소전|\d+분)/g)
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          const location = parts[0];
          const remainingStops = parts.find((s) => s.includes("개소전")) || "";
          const arrivalTime = parts.find((s) => s.includes("분")) || "";
          arrivals.push({
            location,
            remainingStops,
            arrivalTime: arrivalTime || remainingStops,
          });
        }
      }
    });

    return arrivals;
  } catch (error) {
    console.error("Error fetching arrival info:", error.stack);
    return [];
  }
}

// 정류장 검색 API
app.get("/api/station/search/:searchText", async (req, res) => {
  try {
    const searchText = req.params.searchText;
    let str = "";
    const buf = iconv.encode(searchText, "EUC-KR");
    for (let i = 0; i < buf.length; i++) {
      str += "%" + buf[i].toString(16).toUpperCase();
    }

    const url = `https://businfo.daegu.go.kr/ba/route/rtbsarr.do?act=findByBS2&bsNm=${str}`;

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const html = iconv.decode(response.data, "EUC-KR");
    const $ = cheerio.load(html);

    const result = [];
    $("#arrResultBsPanel td.body_col1").each((idx, element) => {
      const onclick = $(element).attr("onclick");
      const firstcom = onclick.indexOf("'");
      const lastcom = onclick.indexOf("'", firstcom + 1);
      const id = onclick.substr(firstcom + 1, lastcom - firstcom - 1);
      let text = $(element).text().trim();
      text = text.substr(0, text.length - 7).trim();
      result.push({
        name: text,
        id: id,
      });
    });

    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "서버 에러가 발생했습니다.",
      details: error.message,
    });
  }
});

// 정류장 상세 정보 API
app.get("/api/station/:stationId", async (req, res) => {
  try {
    const stationId = req.params.stationId;
    const url = `https://businfo.daegu.go.kr/ba/route/rtbsarr.do?act=findByPath&bsId=${stationId}`;

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const html = iconv.decode(response.data, "EUC-KR");
    const $ = cheerio.load(html);
    const busRoutes = [];

    $(".body_row").each((i, element) => {
      const routeCell = $(element).find(".body_col2");
      const routeNumber = routeCell.text().trim();
      const imgSrc = routeCell.find("img").attr("src");

      let busType = "일반";
      if (imgSrc && imgSrc.includes("r01.gif")) {
        busType = "급행";
      } else if (imgSrc && imgSrc.includes("r03.gif")) {
        busType = "일반";
      } else if (imgSrc && imgSrc.includes("r04.gif")) {
        busType = "지선";
      }

      const onclick = $(element).find(".body_col1").attr("onclick");
      const coordinates = onclick?.match(/\d+\.\d+\|\d+\.\d+/g)?.[0];

      const busInfo = {
        routeNumber: routeNumber,
        type: busType,
        coordinates: coordinates,
      };

      if (coordinates) {
        const [x, y] = coordinates.split("|");
        busInfo.position = {
          x: parseFloat(x),
          y: parseFloat(y),
        };
      }

      busRoutes.push(busInfo);
    });

    const stationName = $("#arrResultRed2").text().trim();

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({
      stationName: stationName,
      stationId: stationId,
      routes: busRoutes.map((route) => ({
        ...route,
        routeNumber: route.routeNumber.replace(/^\s+|\s+$/g, ""),
      })),
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "서버 에러가 발생했습니다.",
      details: error.message,
    });
  }
});

// 버스 도착 정보 API

// --- 버스 도착정보 API 수정본 --- //
app.get("/api/arrival/:stationId", async (req, res) => {
  try {
    const stationId = req.params.stationId;
    // 정류장 상세 페이지(도착정보 전체 페이지)를 가져와서 정류장명과 각 노선 정보를 파싱합니다.
    const url = `https://businfo.daegu.go.kr/ba/route/rtbsarr.do?act=findByPath&bsId=${stationId}`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://businfo.daegu.go.kr/",
      },
    });
    const html = iconv.decode(response.data, "EUC-KR");
    const $ = cheerio.load(html);

    const stationName = $("#arrResultRed2").text().trim();
    const busRoutes = [];

    // .body_row 요소 내에 각 노선의 정보가 포함되어 있음
    $(".body_row").each((_, element) => {
      const routeCell = $(element).find(".body_col2");
      const routeNumber = routeCell.text().trim();
      const imgSrc = routeCell.find("img").attr("src");
      let busType = "일반";
      if (imgSrc?.includes("r01.gif")) {
        busType = "급행";
      } else if (imgSrc?.includes("r03.gif")) {
        busType = "일반";
      } else if (imgSrc?.includes("r04.gif")) {
        busType = "지선";
      }
      const onclick = $(element).find(".body_col1").attr("onclick");
      if (onclick) {
        // 따옴표로 묶인 파라미터들을 추출
        const regex = /'([^']+)'/g;
        const params = [];
        let match;
        while ((match = regex.exec(onclick)) !== null) {
          params.push(match[1]);
        }
        // params 배열에서 3번째와 5번째 항목에 각각 routeId와 direction 정보가 담겨 있음
        if (params.length >= 5) {
          const routeId = params[2];
          const direction = params[4];
          busRoutes.push({
            routeNumber,
            type: busType,
            routeId,
            direction,
          });
        }
      }
    });

    // 각 노선별로 도착정보를 가져오는 비동기 작업을 수행합니다.
    const busPromises = busRoutes.map(async (route) => {
      const arrivals = await getBusArrivalInfo(
        stationId,
        stationName,
        route.routeId,
        route.routeNumber,
        route.direction
      );
      return {
        ...route,
        arrivals,
      };
    });

    const buses = await Promise.all(busPromises);

    res.json({
      stationName,
      stationId,
      buses,
    });
  } catch (error) {
    console.error("Error in /api/arrival:", error.stack);
    res.status(500).json({
      error: "서버 에러가 발생했습니다.",
      details: error.message,
    });
  }
});

app
  .listen(port, () => {
    console.log(`Server is running on port ${port}`);
  })
  .on("error", (err) => {
    console.error("Server startup error:", err); // 서버 시작 오류 처리
  });
