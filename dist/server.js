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
const app = (0, express_1.default)();
const port = 8080;
app.use((0, cors_1.default)());
// 정류장 검색 API
app.get("/api/station/search/:searchText", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const searchText = req.params.searchText;
        let str = "";
        const buf = iconv_lite_1.default.encode(searchText, "EUC-KR");
        for (let i = 0; i < buf.length; i++) {
            str += "%" + buf[i].toString(16).toUpperCase();
        }
        const url = `https://businfo.daegu.go.kr/ba/route/rtbsarr.do?act=findByBS2&bsNm=${str}`;
        const response = yield axios_1.default.get(url, {
            responseType: "arraybuffer",
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            },
        });
        const html = iconv_lite_1.default.decode(response.data, "EUC-KR");
        const $ = cheerio.load(html);
        const result = [];
        $("#arrResultBsPanel td.body_col1").each((_, element) => {
            const onclick = $(element).attr("onclick") || "";
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
    }
    catch (error) {
        console.error("Error:", error);
        res.status(500).json({
            error: "서버 에러가 발생했습니다.",
            details: error.message,
        });
    }
}));
// 버스 도착 정보 API
app.get('/api/arrival/:stationId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const stationId = req.params.stationId;
    const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/realtime/arr2/${stationId}`;
    try {
        const response = yield axios_1.default.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://businfo.daegu.go.kr/",
                "Accept": "application/json",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
            }
        });
        const data = response.data;
        res.json(data);
    }
    catch (error) {
        // 더 상세한 에러 로깅
        console.error('API 호출 오류:', {
            message: error.message,
            status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
            data: (_b = error.response) === null || _b === void 0 ? void 0 : _b.data
        });
        res.status(500).json({
            error: 'API 호출 실패',
            details: error.message
        });
    }
}));
// 서버 시작 (listen은 단 한 번만 호출)
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
server.on("error", (err) => {
    console.error("Server startup error:", err);
});
