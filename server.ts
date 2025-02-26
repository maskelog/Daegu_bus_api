import express, { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';
import iconv from 'iconv-lite';
import { Parser } from 'xml2js';
import { Server } from 'http';
import fs from 'fs';
import path from 'path';

const app: express.Application = express();
const port: number = 8080;

app.use(cors());

/* ================================
   asyncHandler 유틸리티 함수
================================ */
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/* ================================
   인터페이스 정의
================================ */
// stations.json의 실제 데이터 구조에 맞게 수정
interface StationSearchResult {
  bsId: string;
  bsNm: string;
  wincId?: string;
  routeList?: string;
  ngisXPos?: string;
  ngisYPos?: string;
  bsBit?: string;
  style?: string;
  seq?: number;
}

interface BusArrival {
  header: {
    success: string;
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
        vhcNo2: string;
        busTCd2: string;
        busTCd3: string;
        busAreaCd: string;
        arrState: string;
        prevBsGap: number;
      }[];
    }[];
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
   캐시 관련 함수 (정류장 데이터)
================================ */
const stationFilePath = path.join(__dirname, '..', 'stations.json');

const loadStationData = (): StationSearchResult[] => {
  try {
    if (fs.existsSync(stationFilePath)) {
      console.log("파일 경로 확인:", stationFilePath);
      const data = fs.readFileSync(stationFilePath, 'utf-8');
      const json = JSON.parse(data);
      
      console.log("JSON 구조:", Object.keys(json));
      if (json && json.Result && json.Result.body) {
        return Array.isArray(json.Result.body) ? json.Result.body : [json.Result.body];
      } else {
        console.error('유효하지 않은 정류장 데이터 구조:', json);
      }
    } else {
      console.error('정류장 데이터 파일을 찾을 수 없습니다:', stationFilePath);
    }
  } catch (error) {
    console.error('정류장 데이터 로딩 오류:', error);
  }
  return [];
};

const saveStationData = (stations: StationSearchResult[]): void => {
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
  fs.writeFileSync(stationFilePath, JSON.stringify(data, null, 4), 'utf-8');
};

/* ================================
   서비스 함수
================================ */

/**
 * 노선 검색 서비스 함수 (샘플 데이터 사용)
 * 실제 구현 시 외부 API 호출 후 데이터를 변환하는 로직으로 대체 가능합니다.
 */
const searchRoutes = async (text: string): Promise<any[]> => {
  return [
    { name: "523", sub: "원대오거리방면", id: "3000523000" },
    { name: "523", sub: "동산네거리방면", id: "3000523001" },
    { name: "524", sub: "default", id: "3000524000" },
    { name: "527", sub: "default", id: "3000527000" }
  ];
};

/**
 * 정류장 검색 서비스 함수 (HTML 파싱)
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
    const bsId = onclick.substring(firstcom + 1, lastcom);
    let bsNm = $(element).text().trim();
    bsNm = bsNm.slice(0, -7).trim();
    results.push({ bsId, bsNm });
  });

  return results;
};

/**
 * 정류장 도착 정보 변환 함수
 */
const transformStationArrival = (data: BusArrival): any[] => {
  const groups: { [key: string]: any } = {};

  if (!data.body || !data.body.list) return [];
  data.body.list.forEach((route) => {
    const routeNo = route.routeNo;
    if (!route.arrList) return;
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
      if (err) reject(err);
      else resolve(result);
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
      if (err) reject(err);
      else resolve(result);
    });
  });
};

/**
 * 정류장 정보 조회 서비스 함수 (버스 도착 정보 변환)
 */
const getStationInfo = async (stationId: string): Promise<any[]> => {
  const busArrivalData = await getBusArrivalInfo(stationId);
  return transformStationArrival(busArrivalData);
};

/* ================================
   라우터 정의
================================ */

// ───────── 노선 관련 ─────────

// 노선 검색 API
app.get('/route/search/:text', asyncHandler(async (req: Request, res: Response) => {
  const text = req.params.text;
  const result = await searchRoutes(text);
  res.json(result);
}));

// 노선 조회 API (버스 위치 포함)
app.get('/route/:id', asyncHandler(async (req: Request, res: Response) => {
  const routeId = req.params.id;
  const routeInfo = await getBusRouteInfo(routeId);
  res.json(routeInfo);
}));

// ───────── 정류장 관련 ─────────

// 정류장 검색 API (경로 파라미터)
app.get('/station/search/:text', asyncHandler(async (req: Request, res: Response) => {
  const text = req.params.text;
  const results = await searchStations(text);
  res.json(results);
}));

// 정류장 정보 조회 API (정류장 ID로 조회)
app.get('/station/:id', asyncHandler(async (req: Request, res: Response) => {
  const stationId = req.params.id;
  const result = await getStationInfo(stationId);
  res.json(result);
}));

// 정류장 도착 정보 조회 API (bsNm 또는 wincId 쿼리 파라미터 사용)
// 예: GET /api/arrival?bsNm=대구역건너&wincId=20022
app.get('/api/arrival', asyncHandler(async (req: Request, res: Response) => {
  const { bsNm, wincId } = req.query;
  if (!bsNm && !wincId) {
    return res.status(400).json({ error: 'bsNm 또는 wincId 중 하나의 쿼리 파라미터가 필요합니다.' });
  }
  const stations: StationSearchResult[] = loadStationData();
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
      const queryName = (bsNm as string).trim();
      if (stationName !== queryName) {
        return false;
      }
    }
    
    // wincId가 제공된 경우 확인
    if (wincId) {
      const stationWinc = station.wincId ? station.wincId.trim() : "";
      const queryWinc = (wincId as string).trim();
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
  const arrivalData = await getStationInfo(stationId);
  res.json({
    station: matched,
    arrival: arrivalData
  });
}));

// ───────── 기존 API (옵션) ─────────

// 버스 도착 정보 API (원본)
app.get('/api/arrival/:stationId', asyncHandler(async (req: Request, res: Response) => {
  const busArrivalData = await getBusArrivalInfo(req.params.stationId);
  res.json(busArrivalData);
}));

// 실시간 버스 위치 조회 API (원본)
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