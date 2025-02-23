import express, { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';
import iconv from 'iconv-lite';
import { Parser } from 'xml2js';
import { Server } from 'http';

const app: express.Application = express();
const port: number = 8080;

app.use(cors());

// 타입 정의
interface BusArrival {
  header: {
    success: boolean;
    resultCode: string;
    resultMsg: string;
  };
  body: {
    blockMsg: string | null;
    block: boolean;
    list: {
      routeNo: string;
      arrList: {
        routeId: string;
        routeNo: string;
        moveDir: string;
        bsGap: number;
        bsNm: string;
        busTCd2: string;
        busTCd3: string;
        busAreaCd: string;
        arrState: string;
        prevBsGap: number;
      }[];
    }[];
  };
}

interface StationSearchResult {
  name: string;
  id: string;
}

interface BusRoute {
  routeNumber: string;
  type: string;
  coordinates?: string;
  position?: {
    x: number;
    y: number;
  };
}

interface ArrivalData {
  routeId: string;
  routeNo: string;
  routeNote: string;
  moveDir: string;
  bsGap: number;
  bsNm: string;
  crfId: number;
  vhcNo2: string;
  busTCd2: string;
  busTCd3: string;
  busAreaCd: string;
  arrState: string;
  prevBsGap: number;
}

interface StationArrivalResponse {
  stationName: string;
  stationId: string;
  buses: ArrivalData[];
}

// 정류장 검색 API
app.get("/api/station/search/:searchText", async (req: Request, res: Response) => {
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
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const html = iconv.decode(response.data as Buffer, "EUC-KR");
    const $ = cheerio.load(html);

    const result: StationSearchResult[] = [];
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
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "서버 에러가 발생했습니다.",
      details: (error as Error).message,
    });
  }
});

// 버스 도착 정보 API
app.get('/api/arrival/:stationId', async (req: Request, res: Response) => {
  const stationId = req.params.stationId;
  const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/realtime/arr2/${stationId}`;
  try {
    const response = await axios.get<BusArrival>(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://businfo.daegu.go.kr/",
        "Accept": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });
    const data = response.data;
    res.json(data);
  } catch (error) {
    // 더 상세한 에러 로깅
    console.error('API 호출 오류:', {
      message: (error as Error).message,
      status: (error as any).response?.status,
      data: (error as any).response?.data
    });
    res.status(500).json({ 
      error: 'API 호출 실패', 
      details: (error as Error).message 
    });
  }
});

// 서버 시작 (listen은 단 한 번만 호출)
const server: Server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

server.on("error", (err: Error) => {
  console.error("Server startup error:", err);
});