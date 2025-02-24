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
/**
 * 버스 도착 정보 데이터 변환 함수
 */
function transformBusArrivalData(originalData) {
    const transformedBuses = [];
    originalData.body.list.forEach((route) => {
        route.arrList.forEach((bus) => {
            // 저상버스 여부 확인 (busTCd2가 'D'인 경우)
            const isLowFloor = bus.busTCd2 === 'D';
            const busNumber = isLowFloor ? `${bus.routeNo}(저상)` : bus.routeNo;
            const busInfo = {
                버스번호: busNumber,
                현재정류소: bus.bsNm,
                남은정류소: `${bus.bsGap} 개소`,
                도착예정소요시간: bus.arrState
            };
            transformedBuses.push(busInfo);
        });
    });
    return {
        header: originalData.header,
        bus: transformedBuses
    };
}
/* ================================
   서비스 함수
================================ */
/**
 * 정류장 검색 API (HTML 파싱)
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
        const id = onclick.substring(firstcom + 1, lastcom);
        let name = $(element).text().trim();
        name = name.slice(0, -7).trim();
        results.push({ name, id });
    });
    return results;
});
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
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
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
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
        });
    });
});
/* ================================
   라우터 정의
================================ */
// 정류장 검색 API
app.get('/api/bs/search', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { searchText, wincId, routeTCd } = req.query;
    const params = new URLSearchParams();
    if (searchText)
        params.append('searchText', searchText);
    if (wincId)
        params.append('wincId', wincId);
    if (routeTCd)
        params.append('routeTCd', routeTCd);
    const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/bs/search?${params.toString()}`;
    console.log("정류장 검색 URL:", url);
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
    parser.parseString(xmlData, (err, result) => {
        if (err) {
            console.error('XML 파싱 오류:', err);
            res.status(500).json({ error: 'XML 파싱 실패' });
        }
        else {
            res.json(result);
        }
    });
})));
// 버스 도착 정보 API
app.get('/api/arrival/:stationId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const busArrivalData = yield getBusArrivalInfo(req.params.stationId);
    const transformedData = transformBusArrivalData(busArrivalData);
    res.json(transformedData);
})));
// 버스 노선 조회 API
app.get('/api/bs/route', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { routeId } = req.query;
    if (!routeId) {
        return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
    }
    const result = yield getBusRouteInfo(routeId);
    res.json(result);
})));
// 실시간 버스 위치 조회 API
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
