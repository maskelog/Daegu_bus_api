"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const cors_1 = __importDefault(require("cors"));
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const xml2js_1 = require("xml2js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const port = 8080;
app.use((0, cors_1.default)());
/* ================================
   asyncHandler 유틸리티 함수
================================ */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
/* ================================
   유틸리티 함수
================================ */
const encodeEUC_KR = (text) => {
    const buf = iconv_lite_1.default.encode(text, 'EUC-KR');
    return Array.from(buf)
        .map((byte) => `%${byte.toString(16).toUpperCase()}`)
        .join('');
};
/* ================================
   캐시 관련 함수 (정류장 데이터)
================================ */
const stationFilePath = path_1.default.join(__dirname, '..', 'stations.json');
const loadStationData = () => {
    try {
        if (fs_1.default.existsSync(stationFilePath)) {
            console.log("파일 경로 확인:", stationFilePath);
            const data = fs_1.default.readFileSync(stationFilePath, 'utf-8');
            const json = JSON.parse(data);
            console.log("JSON 구조:", Object.keys(json));
            if (json && json.Result && json.Result.body) {
                return Array.isArray(json.Result.body) ? json.Result.body : [json.Result.body];
            }
            else {
                console.error('유효하지 않은 정류장 데이터 구조:', json);
            }
        }
        else {
            console.error('정류장 데이터 파일을 찾을 수 없습니다:', stationFilePath);
        }
    }
    catch (error) {
        console.error('정류장 데이터 로딩 오류:', error);
    }
    return [];
};
const saveStationData = (stations) => {
    const data = {
        Result: {
            header: {
                success: "true",
                resultCode: "0000",
                resultMsg: "성공"
            },
            body: stations
        }
    };
    fs_1.default.writeFileSync(stationFilePath, JSON.stringify(data, null, 4), 'utf-8');
};
/* ================================
   서비스 함수
================================ */
/**
 * 노선 검색 서비스 함수 (샘플 데이터 사용)
 * 실제 구현 시 외부 API 호출 후 데이터를 변환하는 로직으로 대체 가능합니다.
 */
const searchRoutes = (text) => __awaiter(void 0, void 0, void 0, function* () {
    return [
        { name: "523", sub: "원대오거리방면", id: "3000523000" },
        { name: "523", sub: "동산네거리방면", id: "3000523001" },
        { name: "524", sub: "default", id: "3000524000" },
        { name: "527", sub: "default", id: "3000527000" }
    ];
});
/**
 * 정류장 검색 서비스 함수 (HTML 파싱)
 */
const searchStations = (searchText) => __awaiter(void 0, void 0, void 0, function* () {
    const encodedText = encodeEUC_KR(searchText);
    const url = `https://businfo.daegu.go.kr/ba/route/rtbsarr.do?act=findByBS2&bsNm=${encodedText}`;
    const response = yield axios_1.default.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        },
    });
    const html = iconv_lite_1.default.decode(response.data, 'EUC-KR');
    const $ = cheerio.load(html);
    const results = [];
    $("#arrResultBsPanel td.body_col1").each((_, element) => {
        const onclick = $(element).attr("onclick") || "";
        const firstcom = onclick.indexOf("'");
        const lastcom = onclick.indexOf("'", firstcom + 1);
        const bsId = onclick.substring(firstcom + 1, lastcom);
        let bsNm = $(element).text().trim();
        bsNm = bsNm.slice(0, -7).trim();
        results.push({ bsId, bsNm });
    });
    return results;
});
/**
 * 정류장 도착 정보 변환 함수
 */
const transformStationArrival = (data) => {
    const groups = {};
    if (!data.body || !data.body.list)
        return [];
    data.body.list.forEach((route) => {
        const routeNo = route.routeNo;
        if (!route.arrList)
            return;
        const arrList = Array.isArray(route.arrList) ? route.arrList : [route.arrList];
        arrList.forEach((arrival) => {
            const key = `${routeNo}_${arrival.moveDir}`;
            if (!groups[key]) {
                groups[key] = {
                    name: routeNo,
                    sub: "default",
                    id: arrival.routeId,
                    forward: arrival.moveDir,
                    bus: []
                };
            }
            const busType = arrival.busTCd2 === "N" ? "저상" : "일반";
            const arrivalTime = arrival.arrState === "운행종료" ? "-" : arrival.arrState;
            groups[key].bus.push({
                "버스번호": `${arrival.vhcNo2}(${busType})`,
                "현재정류소": arrival.bsNm,
                "남은정류소": `${arrival.bsGap} 개소`,
                "도착예정소요시간": arrivalTime
            });
        });
    });
    return Object.values(groups);
};
/**
 * 버스 도착 정보 조회 서비스 함수
 */
const getBusArrivalInfo = (stationId) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/realtime/arr2/${stationId}`;
    const response = yield axios_1.default.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://businfo.daegu.go.kr/',
            'Accept': 'application/json',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        }
    });
    return response.data;
});
/**
 * 버스 노선 조회 서비스 함수 (XML → JSON)
 */
const getBusRouteInfo = (routeId) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/bs/route?routeId=${routeId}`;
    const response = yield axios_1.default.get(url, {
        responseType: 'text',
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/xml",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
        }
    });
    const xmlData = response.data;
    const parser = new xml2js_1.Parser({ explicitArray: false });
    return new Promise((resolve, reject) => {
        parser.parseString(xmlData, (err, result) => {
            if (err)
                reject(err);
            else
                resolve(result);
        });
    });
});
/**
 * 실시간 버스 위치 조회 서비스 함수 (XML → JSON)
 */
const getBusPositionInfo = (routeId) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/realtime/pos/${routeId}`;
    const response = yield axios_1.default.get(url, {
        responseType: 'text',
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/xml",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
        }
    });
    const xmlData = response.data;
    const parser = new xml2js_1.Parser({ explicitArray: false });
    return new Promise((resolve, reject) => {
        parser.parseString(xmlData, (err, result) => {
            if (err)
                reject(err);
            else
                resolve(result);
        });
    });
});
/**
 * 정류장 정보 조회 서비스 함수 (버스 도착 정보 변환)
 */
const getStationInfo = (stationId) => __awaiter(void 0, void 0, void 0, function* () {
    const busArrivalData = yield getBusArrivalInfo(stationId);
    return transformStationArrival(busArrivalData);
});
/* ================================
   라우터 정의
================================ */
// ───────── 노선 관련 ─────────
// 노선 검색 API
app.get('/route/search/:text', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const text = req.params.text;
    const result = yield searchRoutes(text);
    res.json(result);
})));
// 노선 조회 API (버스 위치 포함)
app.get('/route/:id', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const routeId = req.params.id;
    const routeInfo = yield getBusRouteInfo(routeId);
    res.json(routeInfo);
})));
// ───────── 정류장 관련 ─────────
// 정류장 검색 API (경로 파라미터)
app.get('/station/search/:text', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const text = req.params.text;
    const results = yield searchStations(text);
    res.json(results);
})));
// 정류장 정보 조회 API (정류장 ID로 조회)
app.get('/station/:id', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const stationId = req.params.id;
    const result = yield getStationInfo(stationId);
    res.json(result);
})));
// 정류장 도착 정보 조회 API (bsNm 또는 wincId 쿼리 파라미터 사용)
// 예: GET /api/arrival?bsNm=대구역건너&wincId=20022
app.get('/api/arrival', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { bsNm, wincId } = req.query;
    if (!bsNm && !wincId) {
        return res.status(400).json({ error: 'bsNm 또는 wincId 중 하나의 쿼리 파라미터가 필요합니다.' });
    }
    const stations = loadStationData();
    const matched = stations.find(station => {
        // 디버깅용 로그
        if (stations.indexOf(station) < 3) {
            console.log("정류장 확인 중:", {
                station_bsNm: station.bsNm,
                station_wincId: station.wincId,
                query_bsNm: bsNm,
                query_wincId: wincId
            });
        }
        // bsNm이 제공된 경우 확인
        if (bsNm) {
            const stationName = station.bsNm ? station.bsNm.trim() : "";
            const queryName = bsNm.trim();
            if (stationName !== queryName) {
                return false;
            }
        }
        // wincId가 제공된 경우 확인
        if (wincId) {
            const stationWinc = station.wincId ? station.wincId.trim() : "";
            const queryWinc = wincId.trim();
            if (stationWinc !== queryWinc) {
                return false;
            }
        }
        return true;
    });
    if (!matched) {
        return res.status(404).json({ error: '해당 정류장을 찾을 수 없습니다.' });
    }
    const stationId = matched.bsId;
    const arrivalData = yield getStationInfo(stationId);
    res.json({
        station: matched,
        arrival: arrivalData
    });
})));
// ───────── 기존 API (옵션) ─────────
// 버스 도착 정보 API (원본)
app.get('/api/arrival/:stationId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const busArrivalData = yield getBusArrivalInfo(req.params.stationId);
    res.json(busArrivalData);
})));
// 실시간 버스 위치 조회 API (원본)
app.get('/api/pos', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { routeId } = req.query;
    if (!routeId) {
        return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
    }
    const result = yield getBusPositionInfo(routeId);
    res.json(result);
})));
/* ================================
   서버 시작
================================ */
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
server.on('error', (err) => {
    console.error('Server startup error:', err);
});
