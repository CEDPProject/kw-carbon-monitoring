let iotData;
let dataTable;

const today = new Date();
const DAY_MS = 86400000;
const daysBetween = (a, b) => {
  const ms = Math.abs(a.setHours(0, 0, 0, 0) - b.setHours(0, 0, 0, 0));
  return Math.floor(ms / DAY_MS);
};

//qs() 헬퍼로 반복 호출 줄이고, query 결과 재활용
const qs = (sel) => document.querySelector(sel);

// 안전한 값 추출 헬퍼 (amCharts 끊김을 위해 null 사용)
const safe = (v, idx = 0) => (Array.isArray(v) ? v[idx] ?? null : null);

//날짜 선택 컨트롤
const fp = flatpickr("#chartDate", {
  dateFormat: "Y/m/d", // 2025/06/26
  defaultDate: "today",
  maxDate: "today",
  locale: "ko",
  onChange: async function (selectedDates, dateStr) {
    const iaqserial = document.getElementById("iaqList").value;
    await fetchChartData(dateStr, iaqserial).then((data) => {
      iotData = data;
    });
  },
});

const startDtPicker = flatpickr("#startDt", {
  dateFormat: "Y/m/d", // 2025/06/26
  defaultDate: "today",
  maxDate: "today",
  locale: "ko",
  onChange: async function (selectedDates, dateStr) {
    const start = selectedDates[0];
    if (!start) return;
  },
});

const endDt = flatpickr("#endDt", {
  dateFormat: "Y/m/d", // 2025/06/26
  defaultDate: "today",
  maxDate: "today",
  locale: "ko",
  onOpen: function () {
    // start가 없으면 오늘 기준으로 제한
    const start = startDtPicker.selectedDates[0] || today;
    const endMax = new Date(
      Math.min(start.getTime() + 6 * DAY_MS, today.getTime())
    );
    this.set("minDate", start);
    this.set("maxDate", endMax);
  },
  onChange: async function (selectedDates, dateStr) {
    const end = selectedDates[0];
    const start = startDtPicker.selectedDates[0];
    if (!end || !start) return;

    // 사용자가 직접 7일을 넘게 골랐을 경우 보정
    if (daysBetween(start, end) > 6) {
      const fixed = new Date(
        Math.min(start.getTime() + 6 * DAY_MS, today.getTime())
      );
      this.setDate(fixed, true);
    }
  },
});

// 좌우 이동
function shiftDay(delta) {
  const d = fp.selectedDates[0] || new Date();
  d.setDate(d.getDate() + delta);
  fp.setDate(d, true); // true = onChange 트리거
}

qs("#prevDay").addEventListener("click", () => shiftDay(-1));
qs("#nextDay").addEventListener("click", () => shiftDay(1));

///////////////// 날짜 선택 컨트롤 끝

// 페이지 로드 시 스테이션 정보 로드
document.addEventListener("DOMContentLoaded", function () {
  dataTable = new DataTable("#popTable", {
    //serverSide: true,
    autoWidth: false, // 테이블 너비 자동 조정 비활성화
    paging: true, // 페이지네이션 활성화
    searching: false, // 검색 기능 활성화
    pageLength: 10, // 한 페이지에 10개의 항목
    order: [[0, "desc"]],
    dom: '<"top"Blf>rt<"bottom"ip><"clear">', // 버튼 영역 위치 지정

    buttons: [
      {
        extend: "csvHtml5",
        bom: true,
        charset: "UTF-8",
        title: "안전공조시스템 데이터", // 시트 제목
        filename: "안전공조시스템 데이터", // 다운로드 파일명
        text: "측정값 다운로드", // 버튼에 표시될 글자
        className: "btn-primary btn csv-btn align-items-right", // 클래스명
      },
    ],
  });
  initializeEventListeners();
});

// 이벤트 리스너 초기화
let cleanupEvents;
function initializeEventListeners() {
  if (cleanupEvents) return; // 이미 바인딩 됨
  const searchBtn = qs("#modalSearchBtn");
  const onSearch = debounce(performSearch, 200);
  searchBtn.addEventListener("click", performSearch);

  const chartTypes = qs("#chartTypes");
  const onChartTypesClick = () => {
    loadChartData(iotData);
    const iaqserial = qs("#iaqList").value;
    const startDt = qs("#startDt").value;
    const endDt = qs("#endDt").value;
    if (startDt && endDt) loadTableData(iaqserial, startDt, endDt);
  };
  chartTypes.addEventListener("click", onChartTypesClick);

  // 스테이션 변경 시 차트 데이터 다시 로드
  const iaqList = qs("#iaqList");
  const onIaqChange = async function () {
    const iaqserial = iaqList.value;
    const chartDate = qs("#chartDate").value;

    const startDt = qs("#startDt").value;
    const endDt = qs("#endDt").value;

    iotData = await fetchChartData(chartDate, iaqserial);
    loadChartData(iotData);

    loadTableData(iaqserial, startDt, endDt);
  };
  iaqList.addEventListener("change", onIaqChange);

  // 클린업 저장
  cleanupEvents = () => {
    searchBtn.removeEventListener("click", onSearch);
    chartTypes.removeEventListener("click", onChartTypesClick);
    iaqList.removeEventListener("change", onIaqChange);
  };
}

//검색 버튼 연타 시 API 폭주 방지
function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// 검색 수행
async function performSearch() {
  const startDt = document.getElementById("startDt").value;
  const endDt = document.getElementById("endDt").value;
  const iaqserial = document.getElementById("iaqList").value;
  if (!startDt || !endDt) {
    alert("시작일자와 종료일자를 모두 입력해주세요.");
    return;
  }

  try {
    // 테이블 데이터 로드
    await loadTableData(iaqserial, startDt, endDt);
  } catch (error) {
    console.error("검색 실패:", error);
    alert("검색 중 오류가 발생했습니다.");
  }
}

// 테이블 데이터 업데이트
function updateTableData(newData) {
  dataTable.clear().rows.add(newData).draw();
}

async function fetchChartData(dateStr, iaqserial) {
  const res = await fetch(
    `/info/chartData?dateStr=${dateStr}&iaqserial=${iaqserial}`
  );
  if (!res.ok) throw new Error("차트 데이터 응답 오류");
  return await res.json();
}

let chart;

// 차트 데이터 로드
export async function loadChartData(data) {
  if (!data || !Array.isArray(data)) return;
  iotData = data;
  const chkArr = Array.from(document.getElementsByName("chartType"))
    .filter((el) => el.checked)
    .map((el) => ({ value: el.value, name: el.parentNode.textContent.trim() }));

  const now = moment(qs("#chartDate").value).format("YYYY-MM-DD");
  const hisData = data
    .filter((entry) => entry?.[1]?.dataTime?.split(" ")?.[0] === now)
    .map((entry) => {
      const v = entry[1];
      const [d, t] = v.dataTime.split(" ");
      return {
        dataTime: v.dataTime,
        convertTime: `${d}\n${t}`,
        pm10: safe(v.pm10, 0),
        pm25: safe(v.pm25, 0),
        co2: safe(v.co2, 0),
        voc: safe(v.voc, 0),
        temp: safe(v.temp, 0),
        humi: safe(v.humi, 0),
        outdoorPm10: safe(v.outdoorPm10, 0),
        outdoorPm25: safe(v.outdoorPm25, 0),
        outdoorTemp: safe(v.outdoorTemp, 0),
        outdoorHumi: safe(v.outdoorHumi, 0),
        ventPower: safe(v.ventPower, 0),
        ventAirvolume: safe(v.ventAirvolume, 0),
        ventMode: safe(v.ventMode, 0),
        ventWattHour: safe(v.ventWattHour, 0),
        ventWatt: safe(v.ventWatt, 0),
        conPower: safe(v.conPower, 0),
        conMode: safe(v.conMode, 0),
        conAirvolume: safe(v.conAirvolume, 0),
        conSetTemp: safe(v.conSetTemp, 0),
        conWattHour: safe(v.conWattHour, 0),
        conWatt: safe(v.conWatt, 0),
      };
    });

  // 차트 재생성 전 정리
  if (chart) {
    chart.dispose();
    chart = null;
  }

  // 차트 생성
  chart = am4core.create("chartdiv", am4charts.XYChart);
  chart.data = hisData;
  chart.cursor = new am4charts.XYCursor();
  chart.cursor.behavior = "panXY";
  chart.scrollbarX = new am4charts.XYChartScrollbar();
  chart.scrollbarX.parent = chart.topAxesContainer;

  // X축
  const categoryAxis = chart.xAxes.push(new am4charts.CategoryAxis());
  categoryAxis.dataFields.category = "convertTime";
  categoryAxis.renderer.opposite = false;

  // 선택된 항목만 시리즈 생성
  chkArr.forEach(createSeries);

  // 범례 생성
  chart.legend = new am4charts.Legend();
}

// 차트 시리즈 생성
function createSeries(option) {
  // 값 축 생성
  var valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
  valueAxis.renderer.inversed = false;
  valueAxis.title.text = option.name;
  valueAxis.renderer.minLabelPosition = 0.01;
  valueAxis.renderer.line.strokeOpacity = 1;
  valueAxis.renderer.line.strokeWidth = 2;

  // 시리즈 생성
  var series = chart.series.push(new am4charts.LineSeries());
  series.dataFields.valueY = option.value;
  series.dataFields.categoryX = "convertTime";
  series.yAxis = valueAxis;
  series.name = option.name;
  series.tensionX = 0.8;
  series.showOnInit = true;
  series.connect = false;

  // 시리즈 세그먼트 생성
  var segment = series.segments.template;
  segment.interactionsEnabled = true;

  // 시리즈 세그먼트 상태 생성
  var hoverState = segment.states.create("hover");
  hoverState.properties.strokeWidth = 3;

  var dimmed = segment.states.create("dimmed");
  dimmed.properties.stroke = am4core.color("#dadada");

  // 시리즈 툴팁 생성
  series.tooltip.background.cornerRadius = 20;
  series.tooltip.background.strokeOpacity = 0;
  series.tooltip.pointerOrientation = "vertical";
  series.tooltip.label.minWidth = 40;
  series.tooltip.label.minHeight = 40;
  series.tooltip.label.textAlign = "middle";
  series.tooltip.label.textValign = "middle";
  series.tooltipText = "{name}: [bold]{valueY}[/]";

  // 시리즈 스트로크 너비 설정
  series.strokeWidth = 3;

  // 차트 스크롤바 시리즈 추가
  chart.scrollbarX.series.push(series);

  // 값 축 라벨 색상 설정
  valueAxis.renderer.line.stroke = series.stroke;
  valueAxis.renderer.labels.template.fill = series.stroke;
  valueAxis.renderer.opposite = true;

  // 값 축 라인 스트로크 설정
  valueAxis.renderer.line.strokeOpacity = 1;
  valueAxis.renderer.line.strokeWidth = 2;
  valueAxis.renderer.line.stroke = series.stroke;
  valueAxis.renderer.labels.template.fill = series.stroke;
  valueAxis.renderer.opposite = true;
}

// 테이블 데이터 로드
async function loadTableData(iaqserial, startDt, endDt) {
  try {
    const res = await fetch(
      `/info/tableData?iaqserial=${iaqserial}&startDt=${startDt}&endDt=${endDt}`
    );
    if (!res.ok) throw new Error("테이블 데이터 응답 오류");
    const data = await res.json();
    const rows = data.map((entry) => {
      const v = entry?.[1] ?? {};
      return [
        v.dataTime ?? "-",
        safe(v.pm10, 1) ?? "-",
        safe(v.pm25, 1) ?? "-",
        safe(v.co2, 1) ?? "-",
        safe(v.voc, 1) ?? "-",
        safe(v.temp, 1) ?? "-",
        safe(v.humi, 1) ?? "-",
        safe(v.outdoorPm10, 1) ?? "-",
        safe(v.outdoorPm25, 1) ?? "-",
        safe(v.outdoorTemp, 1) ?? "-",
        safe(v.outdoorHumi, 1) ?? "-",
        safe(v.ventPower, 1) ?? "-",
        safe(v.ventAirvolume, 1) ?? "-",
        safe(v.ventMode, 1) ?? "-",
        safe(v.ventWattHour, 1) ?? "-",
        safe(v.ventWatt, 1) ?? "-",
        safe(v.conPower, 1) ?? "-",
        safe(v.conMode, 1) ?? "-",
        safe(v.conAirvolume, 1) ?? "-",
        safe(v.conSetTemp, 1) ?? "-",
        safe(v.conWattHour, 1) ?? "-",
        safe(v.conWatt, 1) ?? "-",
      ];
    });
    updateTableData(rows);
  } catch (error) {
    console.error("테이블 데이터 로드 실패:", error);
  }
}
