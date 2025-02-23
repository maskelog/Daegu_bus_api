import express, { Request, Response } from 'express';
import axios from 'axios';

const app = express();
const port = 3000;

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

app.listen(port, () => {
  console.log(`서버가 ${port} 포트에서 실행 중입니다.`);
});