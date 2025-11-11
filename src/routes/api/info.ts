import { Request, Response, NextFunction, Router, response } from "express";
import { StationService } from "../../services/StationService";
import axios from "axios";
import moment from "moment";

const infoRouter = Router();
const baseUrl = "https://datacenter.kweather.co.kr/api/collection/v2/history";

interface SensorData {
  dataTime?: string;
  pm10?: number;
  pm25?: number;
  co2?: number;
  voc?: number;
  temp?: number;
  humi?: number;
  outdoorPm10?: number;
  outdoorPm25?: number;
  outdoorTemp?: number;
  outdoorHumi?: number;
  ventPower?: number;
  ventAirvolume?: number;
  ventMode?: number;
  ventWatt?: number;
  ventWattHour?: number;
  conPower?: number;
  conMode?: number;
  conAirvolume?: number;
  conSetTemp?: number;
  conTemp?: number;
  conWatt?: number;
  conWattHour?: number;
}
const getDeviceList = async (memberIdx: number) => {
  const stationService = new StationService();
  const [deviceList] = await stationService.getDeviceIdxList(memberIdx);
  return deviceList;
};

infoRouter.get(
  "/",
  async function (req: Request, res: Response, next: NextFunction) {
    const start = parseInt(req.query.start as string); // 페이지의 시작 인덱스
    const length = parseInt(req.query.length as string);

    //사용자 인덱스 USER_ID : iitp-livinglab
    //사용자 장비 리스트 조회

    const deviceList = await getDeviceList(14430);

    if (!deviceList || deviceList.length === 0) {
      return res.status(404).send("No devices found for the user.");
    }

    const iaqList = deviceList.filter((d) => d.device_model.startsWith("IAQ"));
    const oaqList = deviceList.filter((d) => d.device_model.startsWith("OAQ"));

    if (iaqList.length === 0) {
      return res.status(404).send("No IAQ devices found.");
    }

    const startTime = moment().format("YYYY/MM/DD") + "-00:00:00";
    const endTime = moment().format("YYYY/MM/DD") + "-23:59:59";

    const dataMap = await getHistoryData(
      startTime,
      endTime,
      iaqList[0].serial_num,
      oaqList[0].serial_num,
      iaqList[0].idx
    );

    //console.log(iaqData2);

    //장비별 과거 데이터 조회
    //측정장비, 환기,냉난방 장비 합치기
    const iaqData2Array = Array.from(dataMap.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    // 페이지네이션 처리
    //const pageData = iaqData2Array.slice(start, start + length);

    res.render("info", { iaqList, iaqData2: JSON.stringify(iaqData2Array) });
  }
);

infoRouter.get(
  "/chartData",
  async function (req: Request, res: Response, next: NextFunction) {
    const dateStr = req.query.dateStr as string;
    const startTime = dateStr + "-00:00:00";
    const endTime = dateStr + "-23:59:59";
    const iaqserial = req.query.iaqserial as string;
    const deviceList = await getDeviceList(14430);

    const iaqList = deviceList.filter((d) => d.serial_num === iaqserial);
    const oaqList = deviceList.filter((d) => d.device_model.startsWith("OAQ"));

    const dataMap = await getHistoryData(
      startTime,
      endTime,
      iaqserial,
      oaqList[0].serial_num,
      iaqList[0].idx
    );

    //장비별 과거 데이터 조회
    //측정장비, 환기,냉난방 장비 합치기
    const dataArray = Array.from(dataMap.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    res.json(dataArray);
  }
);

infoRouter.get(
  "/tableData",
  async function (req: Request, res: Response, next: NextFunction) {
    const iaqserial = req.query.iaqserial as string;
    const startDt = (req.query.startDt as string) + "-00:00:00";
    const endDt = (req.query.endDt as string) + "-23:59:59";

    const deviceList = await getDeviceList(14430);
    const iaqList = deviceList.filter((d) => d.serial_num === iaqserial);
    const oaqList = deviceList.filter((d) => d.device_model.startsWith("OAQ"));

    const dataMap = await getHistoryData(
      startDt,
      endDt,
      iaqserial,
      oaqList[0].serial_num,
      iaqList[0].idx
    );

    const dataArray = Array.from(dataMap.entries()).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    res.json(dataArray);
  }
);

// 과거 데이터 조회
async function getHistoryData(
  startTime: string, // 시작 시간
  endTime: string, // 종료 시간
  iaqserial: string, // IAQ 시리얼 번호
  oaqserial: string, // OAQ 시리얼 번호
  iaqIdx: number // IAQ 인덱스
) {
  const dataMap: Map<string, SensorData> = new Map();
  const stationService = new StationService();

  const iaqData = await axios
    .get(
      `${baseUrl}?deviceType=iaq&serial=${iaqserial}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`
    )
    .then((res) => res.data.data)
    .catch((err) => {
      console.log(err);
    });

  const oaqData = await axios
    .get(
      `${baseUrl}?deviceType=oaq&serial=${oaqserial}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`
    )
    .then((res) => res.data.data)
    .catch((err) => {
      console.log(err);
    });

  // console.log(iaqData.data.data);
  // console.log(oaqData.data.data);

  const ventList = await stationService.getVentDeviceIdxList(iaqIdx);
  const ventData = await axios
    .get(
      `${baseUrl}?deviceType=vent&serial=${ventList[0].serial_num}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`
    )
    .then((res) => res.data.data)
    .catch((err) => {
      console.log(err);
    });

  const conData = await axios
    .get(
      `${baseUrl}?deviceType=vent&serial=${ventList[1].serial_num}&startTime=${startTime}&endTime=${endTime}&standard=sum&connect=0`
    )
    .then((res) => res.data.data)
    .catch((err) => {
      console.log(err);
    });

  iaqData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      pm10: d.pm10 || "-",
      pm25: d.pm25 || "-",
      co2: d.co2 || "-",
      voc: d.voc || "-",
      temp: d.temp || "-",
      humi: d.humi || "-",
    };

    const existingData = dataMap.get(d.dataTime) ?? {};

    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  oaqData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      outdoorPm10: d.pm10 || "-",
      outdoorPm25: d.pm25 || "-",
      outdoorTemp: d.temp || "-",
      outdoorHumi: d.humi || "-",
    };
    const existingData = dataMap.get(d.dataTime) ?? {};
    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  ventData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      ventPower: d.power || "-",
      ventAirvolume: d.air_volume || "-",
      ventMode: d.op_mode || "-",
      ventWatt: d.watt || "-",
      ventWattHour: d.watt_hour || "-",
    };
    const existingData = dataMap.get(d.dataTime) ?? {};
    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  conData.forEach((d) => {
    const sensor: SensorData = {
      dataTime: d.dataTime,
      conPower: d.power || "-",
      conMode: d.op_mode || "-",
      conAirvolume: d.air_volume || "-",
      conSetTemp: d.set_temp || "-",
      conTemp: d.con_temp || "-",
      conWatt: d.watt || "-",
      conWattHour: d.watt_hour || "-",
    };
    const existingData = dataMap.get(d.dataTime) ?? {};
    dataMap.set(d.dataTime, { ...existingData, ...sensor });
  });

  return dataMap;
}

export { infoRouter };
