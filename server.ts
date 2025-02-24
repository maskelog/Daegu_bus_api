import express, { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';
import iconv from 'iconv-lite';
import { Parser } from 'xml2js';
import { Server } from 'http';

const app: express.Application = express();
const port: number = 8080;

app.use(cors());

/* ================================
   asyncHandler 유틸리티 함수
================================ */
// async 함수에서 발생한 에러를 next()로 전달하여 Express 에러 핸들링 미들웨어로 넘기도록 함
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/* ================================
   인터페이스 정의
================================ */
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

/* ================================
   유틸리티 함수
================================ */
const encodeEUC_KR = (text: string): string => {
  const buf = iconv.encode(text, 'EUC-KR');
  return Array.from(buf)
    .map((byte) => `%${byte.toString(16).toUpperCase()}`)
    .join('');
};

/* ================================
   서비스 함수
================================ */
/**
 * 정류장 검색 API (HTML 파싱)
 */
const searchStations = async (searchText: string): Promise<StationSearchResult[]> => {
  const encodedText = encodeEUC_KR(searchText);
  const url = `https://businfo.daegu.go.kr/ba/route/rtbsarr.do?act=findByBS2&bsNm=${encodedText}`;

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    },
  });

  const html = iconv.decode(response.data as Buffer, 'EUC-KR');
  const $ = cheerio.load(html);
  const results: StationSearchResult[] = [];

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
};

/**
 * 버스 도착 정보 조회 서비스 함수
 */
const getBusArrivalInfo = async (stationId: string): Promise<BusArrival> => {
  const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/realtime/arr2/${stationId}`;
  const response = await axios.get<BusArrival>(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://businfo.daegu.go.kr/',
      'Accept': 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  return response.data;
};

/**
 * 버스 노선 조회 서비스 함수 (XML → JSON)
 */
const getBusRouteInfo = async (routeId: string): Promise<any> => {
  const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/bs/route?routeId=${routeId}`;
  const response = await axios.get(url, {
    responseType: 'text',
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
  const xmlData: string = response.data as string;
  const parser = new Parser({ explicitArray: false });
  return new Promise((resolve, reject) => {
    parser.parseString(xmlData, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

/**
 * 실시간 버스 위치 조회 서비스 함수 (XML → JSON)
 */
const getBusPositionInfo = async (routeId: string): Promise<any> => {
  const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/realtime/pos/${routeId}`;
  const response = await axios.get(url, {
    responseType: 'text',
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
  const xmlData = response.data;
  const parser = new Parser({ explicitArray: false });
  return new Promise((resolve, reject) => {
    parser.parseString(xmlData as string, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

/* ================================
   라우터 정의
================================ */
// 정류장 검색 API
app.get('/api/bs/search', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { searchText, wincId, routeTCd } = req.query;
  
  const params = new URLSearchParams();
  if (searchText) params.append('searchText', searchText as string);
  if (wincId) params.append('wincId', wincId as string);
  if (routeTCd) params.append('routeTCd', routeTCd as string);
  
  const url = `https://businfo.daegu.go.kr:8095/dbms_web_api/bs/search?${params.toString()}`;
  console.log("정류장 검색 URL:", url);
  
  const response = await axios.get(url, {
    responseType: 'text',
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
  const xmlData = response.data;
  const parser = new Parser({ explicitArray: false });
  parser.parseString(xmlData as string, (err, result) => {
    if (err) {
      console.error('XML 파싱 오류:', err);
      res.status(500).json({ error: 'XML 파싱 실패' });
    } else {
      res.json(result);
    }
  });
}));

// 버스 도착 정보 API
app.get('/api/arrival/:stationId', asyncHandler(async (req: Request, res: Response) => {
  const busArrivalData = await getBusArrivalInfo(req.params.stationId);
  res.json(busArrivalData);
}));

// 버스 노선 조회 API
app.get('/api/bs/route', asyncHandler(async (req: Request, res: Response) => {
  const { routeId } = req.query;
  if (!routeId) {
    return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
  }
  const result = await getBusRouteInfo(routeId as string);
  res.json(result);
}));

// 실시간 버스 위치 조회 API
app.get('/api/pos', asyncHandler(async (req: Request, res: Response) => {
  const { routeId } = req.query;
  if (!routeId) {
    return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
  }
  const result = await getBusPositionInfo(routeId as string);
  res.json(result);
}));

/* ================================
   서버 시작
================================ */
const server: Server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

server.on('error', (err: Error) => {
  console.error('Server startup error:', err);
});
