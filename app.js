// ========================================
// 웃음 감지 웹 애플리케이션
// Face-API.js를 사용하여 실시간 얼굴 표정 분석
// ========================================

// DOM 요소들을 가져와서 변수에 저장 (HTML 요소들과 연결)
const video = document.getElementById('video'); // 웹캠 비디오를 표시할 video 요소
const canvas = document.getElementById('face-points'); // 얼굴 인식 결과를 그릴 canvas 요소
const ctx = canvas.getContext('2d'); // canvas에 그림을 그리기 위한 2D 컨텍스트 객체
const scoreValue = document.getElementById('score-value'); // 웃음 점수를 표시할 요소
const message = document.getElementById('message'); // 사용자에게 메시지를 표시할 요소
const messageCamera = document.getElementById('message-camera'); // 카메라 상태 메시지를 표시할 요소
const videoWrapper = document.getElementById('video-wrapper'); // 비디오를 감싸는 컨테이너 요소

// 앱의 전체적인 상태를 관리하는 변수들
let isRunning = false; // 얼굴 감지가 현재 실행 중인지 여부를 나타내는 플래그
let currentScore = 80; // 현재 웃음 점수 (기본값: 80점)
let isMobile = window.innerWidth <= 480; // 현재 화면이 모바일 크기인지 확인 (480px 이하)

// 전역 카메라 상태 관리 변수들 (중복 초기화 방지용)
window.cameraInitializing = false; // 카메라 초기화 진행 중인지 여부
window.cameraStreamActive = false; // 카메라 스트림이 활성화되어 있는지 여부

// 브라우저 환경 감지 (사용자 에이전트 문자열 분석)
const isDesktopBrowser = !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)); // 데스크톱 브라우저인지 확인
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; // iOS 기기인지 확인
const isAndroid = /Android/.test(navigator.userAgent); // 안드로이드 기기인지 확인

// 창 크기 변경 이벤트 리스너 (반응형 디자인을 위한 처리)
window.addEventListener('resize', () => {
    isMobile = window.innerWidth <= 480; // 창 크기가 변경될 때마다 모바일 여부 재확인
    if (video.videoWidth > 0) { // 비디오가 로드되어 있을 때만 캔버스 크기 조정
        resizeCanvas(); // 캔버스 크기를 비디오에 맞게 조정
    }
});

// 캔버스 크기를 비디오에 맞게 조정하는 함수
function resizeCanvas() {
    const wrapperWidth = videoWrapper.clientWidth; // 비디오 컨테이너의 너비
    const wrapperHeight = videoWrapper.clientHeight; // 비디오 컨테이너의 높이
    
    // 비디오와 컨테이너의 비율 계산 (가로세로 비율)
    const videoRatio = video.videoWidth / video.videoHeight; // 비디오의 가로세로 비율
    const wrapperRatio = wrapperWidth / wrapperHeight; // 컨테이너의 가로세로 비율
    
    let canvasWidth, canvasHeight; // 캔버스의 최종 크기를 저장할 변수들
    
    if (videoRatio > wrapperRatio) { // 비디오가 컨테이너보다 더 넓은 경우
        // 비디오가 더 넓은 경우 - 높이를 기준으로 크기 조정
        canvasHeight = wrapperHeight; // 캔버스 높이는 컨테이너 높이와 동일
        canvasWidth = wrapperHeight * videoRatio; // 캔버스 너비는 비율에 맞게 계산
    } else {
        // 비디오가 더 좁은 경우 - 너비를 기준으로 크기 조정
        canvasWidth = wrapperWidth; // 캔버스 너비는 컨테이너 너비와 동일
        canvasHeight = wrapperWidth / videoRatio; // 캔버스 높이는 비율에 맞게 계산
    }
    
    canvas.width = canvasWidth; // 캔버스의 실제 너비 설정
    canvas.height = canvasHeight; // 캔버스의 실제 높이 설정
    
    // 캔버스 위치 조정 (중앙 정렬을 위한 계산)
    canvas.style.left = `${(wrapperWidth - canvasWidth) / 2}px`; // 수평 중앙 정렬
    canvas.style.top = `${(wrapperHeight - canvasHeight) / 2}px`; // 수직 중앙 정렬
    
    console.log(`캔버스 크기 조정: ${canvasWidth} x ${canvasHeight}`); // 디버깅을 위한 로그 출력
}

// Face-API.js 모델 로드 및 앱 초기화 함수
async function init() {
    try {
        console.log("앱 초기화 시작: 브라우저 환경 - " + (isDesktopBrowser ? "데스크톱" : "모바일")); // 초기화 시작 로그
        
        // 이미 카메라가 활성화되어 있는지 확인 (중복 초기화 방지)
        if (window.cameraStreamActive) {
            console.log("카메라가 이미 활성화되어 있습니다. 초기화 생략."); // 중복 초기화 방지 로그
            
            // 이미 카메라가 작동 중이라면 얼굴 감지만 시작
            if (!isRunning) { // 얼굴 감지가 실행 중이 아닐 때만
                isRunning = true; // 실행 플래그 설정
                startFaceDetection(); // 얼굴 감지 시작
            }
            
            messageCamera.innerText = '얼굴을 카메라에 맞춰주세요'; // 사용자에게 안내 메시지 표시
            return; // 함수 종료
        }
        
        // 메시지 요소 존재 확인 (null 체크)
        if (!messageCamera) {
            console.error("카메라 메시지 요소를 찾을 수 없습니다"); // 에러 로그
            return; // 함수 종료
        }
        
        messageCamera.innerText = '모델을 로딩하는 중...'; // 사용자에게 로딩 상태 알림
        
        // 모델 URL (CDN에서 모델 로드) - Face-API.js 공식 모델 저장소
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        
        console.log("Face-API.js 모델 로딩 시작"); // 모델 로딩 시작 로그
        
        // 필요한 모델들을 병렬로 로드 (비동기 처리)
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL), // 경량 얼굴 감지 모델
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), // 얼굴 랜드마크 68점 모델
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL) // 표정 인식 모델 추가
        ]).catch(err => {
            console.error("모델 로드 중, 오류:", err); // 모델 로드 에러 로그
            messageCamera.innerText = '모델 로드 중 오류가 발생했습니다: ' + err.message; // 사용자에게 에러 메시지 표시
            throw err; // 에러를 상위로 전파
        });
        
        console.log("Face-API.js 모델 로딩 완료"); // 모델 로딩 완료 로그
        
        messageCamera.innerText = '카메라 시작 중...'; // 카메라 초기화 시작 메시지
        
        // 카메라 초기화 함수 호출
        await setupCamera();
        
        // 얼굴 감지 시작
        isRunning = true; // 실행 플래그 설정
        startFaceDetection(); // 얼굴 감지 함수 시작
        
        messageCamera.innerText = '얼굴을 카메라에 맞춰주세요'; // 사용자에게 최종 안내 메시지
    } catch (error) {
        console.error('초기화 실패:', error); // 초기화 실패 에러 로그
        messageCamera.innerText = '카메라 접근에 실패했습니다: ' + error.message; // 사용자에게 에러 메시지 표시
        
        // 재시도 버튼 표시 (사용자가 다시 시도할 수 있도록)
        const retryButton = document.getElementById('retry-camera-button');
        if (retryButton) { // 재시도 버튼이 존재하는지 확인
            retryButton.style.display = 'block'; // 재시도 버튼을 보이게 설정
        }
    }
}

// 카메라 설정 및 초기화 함수
async function setupCamera() {
    try {
        // 이미 카메라 스트림이 활성화되어 있으면 중복 초기화 방지
        if (window.cameraStreamActive && video.srcObject) {
            console.log("카메라가 이미 활성화되어 있습니다. setupCamera 호출 무시"); // 중복 호출 방지 로그
            return Promise.resolve(); // 성공적으로 완료된 Promise 반환
        }
        
        // 각 플랫폼별 카메라 제약 조건 설정
        let constraints = { 
            video: { 
                facingMode: 'user', // 전면 카메라 사용 (셀카 모드)
                width: { ideal: 640 }, // 이상적인 너비: 640px
                height: { ideal: 480 } // 이상적인 높이: 480px
            },
            audio: false // 오디오는 사용하지 않음
        };
        
        // 모바일 기기별 특수 설정 적용
        if (isIOS) {
            console.log("iOS, 특수 설정 적용"); // iOS 감지 로그
            constraints.video = {
                facingMode: 'user', // 전면 카메라 사용
                width: { min: 320, ideal: 640, max: 1280 }, // iOS용 너비 범위 설정
                height: { min: 240, ideal: 480, max: 720 } // iOS용 높이 범위 설정
            };
        } else if (isAndroid) {
            console.log("안드로이드, 특수 설정 적용"); // 안드로이드 감지 로그
            constraints.video = {
                facingMode: 'user', // 전면 카메라 사용
                width: { min: 320, ideal: 640, max: 1280 }, // 안드로이드용 너비 범위 설정
                height: { min: 240, ideal: 480, max: 720 } // 안드로이드용 높이 범위 설정
            };
        }
        
        // 카메라 스트림 가져오기 (사용자 권한 요청)
        console.log("카메라 스트림 요청 중..."); // 카메라 접근 시도 로그
        const stream = await navigator.mediaDevices.getUserMedia(constraints); // 미디어 스트림 요청
        
        // 비디오 요소에 스트림 연결 및 설정
        video.srcObject = stream; // 비디오 요소에 카메라 스트림 연결
        video.setAttribute('playsinline', true); // iOS에서 인라인 재생 허용 (전체화면 방지)
        video.setAttribute('autoplay', true); // 자동 재생 설정
        video.muted = true; // 음소거 설정 (필수)
        
        // 전역 플래그 설정 (카메라 활성화 상태 표시)
        window.cameraStreamActive = true;
        
        // 비디오 메타데이터 로드 완료 대기
        return new Promise((resolve) => {
            video.onloadedmetadata = () => { // 비디오 메타데이터가 로드되면 실행
                // 캔버스 크기 조정 (비디오 크기에 맞게)
                resizeCanvas();
                
                // 비디오 재생 시작
                video.play()
                    .then(() => {
                        console.log("카메라 초기화 성공"); // 성공 로그
                        resolve(); // Promise 완료
                    })
                    .catch(error => {
                        console.error("비디오 재생 오류:", error); // 재생 오류 로그
                        // 오류가 발생해도 성공한 것으로 처리 (iOS에서 중요)
                        resolve(); // Promise 완료 (에러 무시)
                    });
            };
            
            // 비디오 오류 처리
            video.onerror = (err) => {
                console.error("비디오 요소 오류:", err); // 비디오 요소 오류 로그
                throw new Error("비디오 요소 오류"); // 새로운 에러 생성
            };
        });
    } catch (error) {
        console.error("카메라 접근 오류:", error.name, error.message); // 카메라 접근 오류 로그
        throw error; // 에러를 상위로 전파
    }
}

// 얼굴 감지 및 표정 분석 시작 함수
function startFaceDetection() {
    isRunning = true; // 실행 상태 플래그 설정
    detectFace(); // 얼굴 감지 함수 호출
}

// 실시간 얼굴 감지 및 분석 함수 (재귀적으로 호출됨)
async function detectFace() {
    if (!isRunning) return; // 실행 중이 아니면 함수 종료
    
    try {
        // Face-API.js를 사용하여 얼굴 감지 수행
        const detections = await faceapi.detectSingleFace(
            video, // 비디오 요소에서 얼굴 감지
            new faceapi.TinyFaceDetectorOptions({
                inputSize: isMobile ? 224 : 320, // 모바일이면 224, 데스크톱이면 320 (성능 최적화)
                scoreThreshold: 0.5 // 얼굴 감지 임계값 (0.5 이상일 때만 감지)
            })
        ).withFaceLandmarks() // 얼굴 랜드마크 감지 추가
         .withFaceExpressions(); // 표정 인식 추가
        
        ctx.clearRect(0, 0, canvas.width, canvas.height); // 캔버스 초기화 (이전 그림 지우기)
        
        if (detections) { // 얼굴이 감지되었을 때
            const displaySize = { width: canvas.width, height: canvas.height }; // 캔버스 크기 정보
            const resizedDetections = faceapi.resizeResults(detections, displaySize); // 감지 결과를 캔버스 크기에 맞게 조정
            
            // 표정 인식을 활용한 웃음/찡그림 분석하기
            analyzeSmileWithExpressions(resizedDetections);
        } else {
            messageCamera.innerText = '얼굴이 감지되지 않았습니다'; // 얼굴 미감지 메시지
        }
        
        requestAnimationFrame(detectFace); // 다음 프레임에서 다시 실행 (재귀 호출)
    } catch (error) {
        console.error('얼굴 감지 오류:', error); // 얼굴 감지 오류 로그
        messageCamera.innerText = '얼굴 감지 중 오류가 발생했습니다'; // 오류 메시지 표시
        setTimeout(() => { // 2초 후 재시도
            if (isRunning) detectFace(); // 여전히 실행 중이면 다시 시도
        }, 2000); // 에러 발생 시 2초 후 재시도
    }
}

// 점 그리기 헬퍼 함수 (얼굴 랜드마크 시각화용)
function drawPoints(points, radius, color) {
    ctx.fillStyle = color; // 점의 색깔 설정
    for (let i = 0; i < points.length; i++) { // 모든 점에 대해 반복
        ctx.beginPath(); // 새로운 경로 시작
        ctx.arc(points[i].x, points[i].y, radius, 0, 2 * Math.PI); // 원 그리기
        ctx.fill(); // 원 채우기
    }
}

// 표정 인식을 활용한 웃음/찡그림 분석 함수
function analyzeSmileWithExpressions(detections) {
    // 표정 인식 결과 가져오기
    const expressions = detections.expressions; // Face-API.js 표정 인식 결과
    console.log('표정 인식 결과:', expressions); // 디버깅용 로그
    
    // 주요 표정 값 추출 (0~1 사이 값)
    const happyScore = expressions.happy;      // 행복/웃음 점수
    const sadScore = expressions.sad;          // 슬픔 점수
    const angryScore = expressions.angry;      // 화남 점수
    const surprisedScore = expressions.surprised; // 놀람 점수
    const neutralScore = expressions.neutral;  // 중립적 표정 점수
    
    // 디버깅 정보 출력 (개발자 도구에서 확인 가능)
    console.log('웃음 점수:', (happyScore * 100).toFixed(2)); // 웃음 점수를 백분율로 표시
    console.log('슬픔 점수:', (sadScore * 100).toFixed(2)); // 슬픔 점수를 백분율로 표시
    console.log('화남 점수:', (angryScore * 100).toFixed(2)); // 화남 점수를 백분율로 표시
    
    // 기본 점수 계산 (웃음은 긍정적, 슬픔/화남은 부정적)
    let baseScore = 80; // 기본 점수 (중립 상태)
    
    // 행복 점수에 따른 추가 점수 (최대 17점)
    const happyBonus = Math.round(happyScore * 17); // 행복 점수를 17점 만점으로 변환
    
    // 부정적 표정에 따른 감점 (최대 -20점)
    const negativeScore = Math.round((sadScore + angryScore) * 20); // 슬픔+화남 점수를 20점 만점으로 변환
    
    // 최종 점수 계산 (긍정 보너스 더하고 부정 점수 빼기)
    let smileScore = baseScore + happyBonus - negativeScore; // 기본점수 + 행복보너스 - 부정감점
    
    // 점수 범위 제한 (60점 ~ 100점)
    smileScore = Math.max(60, Math.min(100, smileScore)); // 60점 미만은 60점, 100점 초과는 100점으로 제한
    
    // 이전 랜드마크 기반 분석과의 혼합을 위해 입 모양도 분석
    const mouth = detections.landmarks.getMouth(); // 얼굴 랜드마크에서 입 부분 추출
    
    // 입 모양 분석을 위한 주요 포인트 (68개 랜드마크 중 입 관련 포인트)
    const topLip = mouth[14];    // 윗입술 중앙 포인트
    const bottomLip = mouth[18]; // 아랫입술 중앙 포인트
    const leftCorner = mouth[0]; // 왼쪽 입꼬리 포인트
    const rightCorner = mouth[6];// 오른쪽 입꼬리 포인트
    
    // 입꼬리 위치 분석 (U자형 vs 역U자형)
    const lipCenter = (topLip.y + bottomLip.y) / 2; // 입술 중앙의 Y 좌표
    const cornerHeight = (leftCorner.y + rightCorner.y) / 2; // 입꼬리 평균 Y 좌표
    const lipCurve = (lipCenter - cornerHeight) / Math.abs(bottomLip.y - topLip.y); // 입의 곡률 계산
    
    // 입 곡률에 따른 미세 조정 (최대 ±5점)
    if (lipCurve > 0.1) { // 입꼬리가 올라간 경우 (웃는 표정)
        smileScore += 3; // 3점 추가
    } else if (lipCurve < -0.1) { // 입꼬리가 내려간 경우 (찡그린 표정)
        smileScore -= 5; // 5점 감점
    }
    
    // 최종 점수 범위 재확인 (안전장치)
    smileScore = Math.max(60, Math.min(100, smileScore)); // 다시 한번 범위 제한
    
    // 점수 변화 속도 조정 (30% 더 천천히 진행)
    let changeSpeed;
    if (currentScore >= 95) {
        // 95점 이상에서는 매우 천천히 변화 (80% 이전 점수 + 20% 현재 점수)
        changeSpeed = 0.2;
    } else if (currentScore >= 90) {
        // 90점 이상에서는 천천히 변화 (75% 이전 점수 + 25% 현재 점수)
        changeSpeed = 0.25;
    } else if (currentScore >= 85) {
        // 85점 이상에서는 조금 천천히 변화 (70% 이전 점수 + 30% 현재 점수)
        changeSpeed = 0.3;
    } else {
        // 85점 미만에서는 기본 속도보다 30% 느리게 (65% 이전 점수 + 35% 현재 점수)
        changeSpeed = 0.35;
    }
    
    currentScore = currentScore * (1 - changeSpeed) + smileScore * changeSpeed;
    
    console.log(`점수 변화 속도: ${(changeSpeed * 100).toFixed(0)}%, 현재 점수: ${currentScore.toFixed(1)}`);
    
    // 점수 표시 업데이트 (UI 스타일링)
    scoreValue.style.fontWeight = 'bold'; // 점수 텍스트를 굵게
    scoreValue.style.color = '#3498db';  // 점수 텍스트 색상을 파란색으로
    scoreValue.innerText = Math.round(currentScore); // 점수를 정수로 반올림하여 표시
    
    // 메시지 업데이트 (점수에 따른 메시지 변경)
    updateMessage(currentScore);
}

// 점수에 따른 메시지 업데이트 함수
function updateMessage(score) {
    const roundedScore = Math.round(score); // 점수를 정수로 반올림
    message.style.fontWeight = 'bold'; // 메시지 텍스트를 굵게
    message.style.color = '#3498db';  // 메시지 텍스트 색상을 파란색으로 통일
    
    // 점수 구간에 따른 메시지 분기 처리
    if (roundedScore >= 100) { // 100점 달성
        message.innerText = '축하합니다! 완벽한 100점! 🎉🎉'; // 축하 메시지
        // 100점 달성 시 축하 효과 실행
        triggerCelebration();
        // 음료수 증정 메시지 표시
        showPrizeMessage();
    } else if (roundedScore >= 97) { // 97점 이상
        message.innerText = '완벽한 웃음이에요! 😊😊'; // 완벽한 웃음 메시지
    } else if (roundedScore >= 95) { // 95점 이상
        message.innerText = '활짝 웃는 얼굴이에요! 😊'; // 활짝 웃음 메시지
    } else if (roundedScore >= 90) { // 90점 이상
        message.innerText = '기분 좋게 웃고 있어요! 😄'; // 기분 좋은 웃음 메시지
    } else if (roundedScore >= 85) { // 85점 이상
        message.innerText = '살짝 웃고 있네요! 🙂'; // 살짝 웃음 메시지
    } else if (roundedScore >= 80) { // 80점 이상
        message.innerText = '자연스러운 표정이에요. 😌'; // 자연스러운 표정 메시지
    } else if (roundedScore >= 75) { // 75점 이상
        message.innerText = '살짝 찡그리고 있어요. 😕'; // 살짝 찡그림 메시지
    } else if (roundedScore >= 70) { // 70점 이상
        message.innerText = '조금 찡그리고 있어요. 😣'; // 조금 찡그림 메시지
    } else if (roundedScore >= 65) { // 65점 이상
        message.innerText = '많이 찡그리고 있어요. 😖'; // 많이 찡그림 메시지
    } else { // 65점 미만
        message.innerText = '너무 찡그리고 있어요! 힘내세요! 😫'; // 격려 메시지
    }
}

// 카메라 재시도 함수 (에러 발생 시 사용자가 다시 시도할 수 있도록)
function retryCamera() {
    // 재시도 버튼 숨기기
    const retryButton = document.getElementById('retry-camera-button');
    if (retryButton) { // 재시도 버튼이 존재하는지 확인
        retryButton.style.display = 'none'; // 재시도 버튼 숨기기
    }
    
    // 기존 카메라 스트림 정리 (메모리 누수 방지)
    if (video.srcObject) { // 비디오에 스트림이 연결되어 있으면
        const tracks = video.srcObject.getTracks(); // 모든 미디어 트랙 가져오기
        tracks.forEach(track => track.stop()); // 각 트랙 정지
        video.srcObject = null; // 비디오 스트림 연결 해제
    }
    
    // 기존 초기화 플래그 제거 (재초기화 준비)
    window.cameraInitializing = false; // 카메라 초기화 플래그 리셋
    window.cameraStreamActive = false; // 카메라 활성화 플래그 리셋
    
    // 1초 후 다시 시도 (사용자 경험 개선)
    setTimeout(() => {
        init(); // 앱 재초기화
    }, 1000);
}

// 100점 달성 시 축하 효과 함수
function triggerCelebration() {
    // 폭죽 터지는 효과 생성
    createFireworksEffect();
    
    // 축하 사운드 재생
    playCelebrationSound();
    
    // 5초 후 효과 정리 (폭죽 효과를 더 오래 감상)
    setTimeout(() => {
        clearCelebrationEffects(); // 축하 효과 요소들 제거
    }, 5000);
}

// 폭죽 터지는 효과 생성 함수
function createFireworksEffect() {
    const effectCount = 80; // 생성할 효과 요소 개수 (더 많이)
    const fireworks = ['✨', '💥', '🎆', '🎇', '⭐', '💫', '🌟']; // 폭죽 이모지 배열
    const sparkles = ['✨', '💫', '⭐', '🌟', '💥']; // 반짝이 이모지 배열
    
    // 폭죽 효과 요소들을 순차적으로 생성
    for (let i = 0; i < effectCount; i++) {
        setTimeout(() => { // 각 요소를 시간차를 두고 생성
            const element = document.createElement('div'); // 새로운 div 요소 생성
            
            // 폭죽과 반짝이를 랜덤하게 선택
            if (i % 4 === 0 || i % 4 === 1) { // 절반은 폭죽
                element.innerHTML = fireworks[Math.floor(Math.random() * fireworks.length)]; // 랜덤 폭죽 선택
                element.className = 'celebration-firework'; // 폭죽 클래스 적용
            } else { // 나머지는 반짝이
                element.innerHTML = sparkles[Math.floor(Math.random() * sparkles.length)]; // 랜덤 반짝이 선택
                element.className = 'celebration-sparkle'; // 반짝이 클래스 적용
            }
            
            // 요소 스타일 설정
            element.style.position = 'fixed'; // 화면에 고정 위치
            
            // 폭죽 터지는 위치 (여러 곳에서 동시에)
            const explosionPoints = [
                { x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }, // 상단 좌우
                { x: 0.5, y: 0.2 }, // 중앙 상단
                { x: 0.1, y: 0.6 }, { x: 0.9, y: 0.6 }, // 중간 좌우
                { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }, // 하단 좌우
            ];
            
            const explosionPoint = explosionPoints[i % explosionPoints.length];
            const centerX = window.innerWidth * explosionPoint.x;
            const centerY = window.innerHeight * explosionPoint.y;
            
            // 중심점에서 퍼져나가는 효과
            const angle = (Math.random() * 360) * (Math.PI / 180);
            const distance = 50 + Math.random() * 200; // 터지는 반지름
            const startX = centerX;
            const startY = centerY;
            const endX = centerX + Math.cos(angle) * distance;
            const endY = centerY + Math.sin(angle) * distance;
            
            element.style.left = startX + 'px';
            element.style.top = startY + 'px';
            element.style.fontSize = (20 + Math.random() * 15) + 'px'; // 랜덤 크기 (20~35px)
            element.style.zIndex = '9999'; // 최상위 레이어
            element.style.pointerEvents = 'none'; // 마우스 이벤트 차단
            
            // 폭죽은 중심에서 사방으로 터짐, 반짝이는 랜덤하게 반짝임
            if (element.className === 'celebration-firework') {
                element.style.animation = `firework-explode 2s ease-out forwards`; // 폭죽 애니메이션
                element.style.setProperty('--end-x', endX + 'px');
                element.style.setProperty('--end-y', endY + 'px');
            } else {
                element.style.animation = 'sparkle-twinkle 1.5s ease-in-out forwards'; // 반짝이 애니메이션
            }
            
            // CSS 애니메이션 추가 (동적 스타일 생성)
            if (!document.getElementById('celebration-style')) { // 스타일이 없으면 생성
                const style = document.createElement('style'); // 새로운 style 요소 생성
                style.id = 'celebration-style'; // 스타일 ID 설정
                style.textContent = `
                    @keyframes firework-explode {
                        0% {
                            transform: translate(0, 0) scale(0.3);
                            opacity: 1;
                        }
                        30% {
                            transform: translate(0, 0) scale(1.2);
                            opacity: 1;
                        }
                        100% {
                            transform: translate(var(--end-x, 200px), var(--end-y, 200px)) scale(0.5);
                            opacity: 0;
                        }
                    }
                    @keyframes sparkle-twinkle {
                        0% {
                            transform: rotate(0deg) scale(0);
                            opacity: 0;
                        }
                        25% {
                            transform: rotate(90deg) scale(1.5);
                            opacity: 1;
                        }
                        50% {
                            transform: rotate(180deg) scale(1);
                            opacity: 0.8;
                        }
                        75% {
                            transform: rotate(270deg) scale(1.8);
                            opacity: 1;
                        }
                        100% {
                            transform: rotate(360deg) scale(0);
                            opacity: 0;
                        }
                    }
                `; // CSS 애니메이션 정의
                document.head.appendChild(style); // 스타일을 head에 추가
            }
            
            document.body.appendChild(element); // 요소를 body에 추가
            
            // 3초 후 자동 제거 (메모리 누수 방지)
            setTimeout(() => {
                if (element.parentNode) { // 요소가 DOM에 있으면
                    element.parentNode.removeChild(element); // 요소 제거
                }
            }, 3000);
        }, i * 25); // 폭죽은 더 빠르게 연속으로 터짐 (25ms 간격)
    }
}

// 축하 사운드 재생 함수 (실제 오디오 파일 사용)
function playCelebrationSound() {
    try {
        // 박수 소리 재생 (여러 번)
        playRealApplauseSound();
        
        // 환호 소리 재생
        playRealCheersSound();
        
        console.log('🎉 실제 오디오 파일로 축하 소리 재생!');
        
    } catch (error) {
        console.error('축하 사운드 재생 오류:', error);
    }
}

// 실제 박수 파일 재생 함수
function playRealApplauseSound() {
    try {
        // 박수 소리를 여러 번 재생 (겹치는 효과)
        const applauseTimes = [0, 500, 1000, 1500, 2000]; // 0.5초 간격으로 5번
        
        applauseTimes.forEach((delay, index) => {
            setTimeout(() => {
                const audio = new Audio('assets/clap.MP3');
                audio.volume = 0.8 - (index * 0.1); // 점점 작아지게
                audio.play().catch(error => {
                    console.log('박수 소리 재생 실패:', error);
                });
            }, delay);
        });
        
        console.log('👏 실제 박수 파일 재생!');
        
    } catch (error) {
        console.error('박수 파일 재생 오류:', error);
    }
}

// 실제 환호 파일 재생 함수
function playRealCheersSound() {
    try {
        // 여러 축하 소리를 연속으로 재생
        const cheerSounds = [
            { file: 'assets/con_01.mp3', delay: 0, volume: 0.7 },
            { file: 'assets/d5_joy.wav', delay: 800, volume: 0.6 },
            { file: 'assets/suc_01.wav', delay: 1500, volume: 0.8 },
            { file: 'assets/con_02.mp3', delay: 2200, volume: 0.5 },
            { file: 'assets/suc_02.mp3', delay: 3000, volume: 0.7 }
        ];
        
        cheerSounds.forEach(sound => {
            setTimeout(() => {
                const audio = new Audio(sound.file);
                audio.volume = sound.volume;
                audio.play().catch(error => {
                    console.log(`환호 소리 재생 실패 (${sound.file}):`, error);
                });
            }, sound.delay);
        });
        
        console.log('🎉 실제 환호 파일들 재생!');
        
    } catch (error) {
        console.error('환호 파일 재생 오류:', error);
    }
}

// 기존 Web Audio API 함수들 (사용 안 함)
// 박수 소리 재생
function playApplauseSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 더 현실적인 박수 소리 패턴 (여러 사람이 박수치는 효과)
        const applausePattern = [
            // 첫 번째 물결
            { delay: 0, duration: 0.08, pitch: 800 },
            { delay: 0.05, duration: 0.06, pitch: 1200 },
            { delay: 0.12, duration: 0.1, pitch: 900 },
            { delay: 0.18, duration: 0.07, pitch: 1100 },
            { delay: 0.25, duration: 0.09, pitch: 850 },
            
            // 두 번째 물결 (더 강하게)
            { delay: 0.4, duration: 0.12, pitch: 950 },
            { delay: 0.45, duration: 0.08, pitch: 1300 },
            { delay: 0.52, duration: 0.1, pitch: 800 },
            { delay: 0.6, duration: 0.11, pitch: 1000 },
            { delay: 0.68, duration: 0.09, pitch: 1150 },
            
            // 세 번째 물결 (절정)
            { delay: 0.85, duration: 0.15, pitch: 900 },
            { delay: 0.9, duration: 0.12, pitch: 1200 },
            { delay: 0.98, duration: 0.14, pitch: 850 },
            { delay: 1.05, duration: 0.1, pitch: 1050 },
            { delay: 1.12, duration: 0.13, pitch: 950 },
            { delay: 1.2, duration: 0.11, pitch: 1100 },
            
            // 마무리 (점점 줄어드는)
            { delay: 1.4, duration: 0.2, pitch: 800 },
            { delay: 1.5, duration: 0.15, pitch: 1000 },
            { delay: 1.65, duration: 0.18, pitch: 900 },
        ];
        
        applausePattern.forEach((clap) => {
            setTimeout(() => {
                // 화이트 노이즈로 박수 소리 시뮬레이션
                const bufferSize = audioContext.sampleRate * clap.duration;
                const buffer = audioContext.createBuffer(2, bufferSize, audioContext.sampleRate);
                
                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                    const channelData = buffer.getChannelData(channel);
                    for (let i = 0; i < bufferSize; i++) {
                        // 노이즈 생성 (박수 소리 효과)
                        channelData[i] = (Math.random() * 2 - 1) * 0.3;
                    }
                }
                
                const source = audioContext.createBufferSource();
                const gainNode = audioContext.createGain();
                const filter = audioContext.createBiquadFilter();
                
                // 필터로 박수 소리처럼 만들기 (각기 다른 음높이)
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(clap.pitch, audioContext.currentTime);
                filter.Q.setValueAtTime(2, audioContext.currentTime); // 더 날카로운 필터
                
                source.buffer = buffer;
                
                // 볼륨 조절 (빠르게 커졌다 작아지기)
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + clap.duration);
                
                // 오디오 노드 연결
                source.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                source.start();
                
            }, clap.delay * 1000);
        });
        
        console.log('👏 박수 소리 재생!');
        
    } catch (error) {
        console.error('박수 소리 재생 실패:', error);
    }
}

// 추가 박수 효과 (더 강력하고 지속적인)
function playExtraApplause() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 더 많고 강력한 박수 패턴
        const extraApplausePattern = [
            // 초기 폭발적인 박수
            { delay: 0.8, duration: 0.3, pitch: 1000, volume: 0.6 },
            { delay: 0.85, duration: 0.25, pitch: 1200, volume: 0.5 },
            { delay: 0.9, duration: 0.3, pitch: 800, volume: 0.55 },
            { delay: 0.95, duration: 0.28, pitch: 1100, volume: 0.45 },
            { delay: 1.0, duration: 0.35, pitch: 900, volume: 0.6 },
            
            // 지속적인 박수 (더 오래)
            { delay: 1.5, duration: 0.4, pitch: 950, volume: 0.7 },
            { delay: 1.6, duration: 0.35, pitch: 1150, volume: 0.6 },
            { delay: 1.7, duration: 0.45, pitch: 850, volume: 0.65 },
            { delay: 1.8, duration: 0.4, pitch: 1050, volume: 0.55 },
            { delay: 1.9, duration: 0.5, pitch: 950, volume: 0.7 },
            { delay: 2.0, duration: 0.45, pitch: 1100, volume: 0.6 },
            
            // 피날레 박수
            { delay: 2.5, duration: 0.6, pitch: 900, volume: 0.8 },
            { delay: 2.6, duration: 0.55, pitch: 1200, volume: 0.75 },
            { delay: 2.7, duration: 0.7, pitch: 800, volume: 0.8 },
            { delay: 2.8, duration: 0.65, pitch: 1000, volume: 0.7 },
        ];
        
        extraApplausePattern.forEach((clap) => {
            setTimeout(() => {
                const bufferSize = audioContext.sampleRate * clap.duration;
                const buffer = audioContext.createBuffer(2, bufferSize, audioContext.sampleRate);
                
                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                    const channelData = buffer.getChannelData(channel);
                    for (let i = 0; i < bufferSize; i++) {
                        // 더 강력한 노이즈 (박수 소리)
                        channelData[i] = (Math.random() * 2 - 1) * 0.6;
                    }
                }
                
                const source = audioContext.createBufferSource();
                const gainNode = audioContext.createGain();
                const filter = audioContext.createBiquadFilter();
                
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(clap.pitch, audioContext.currentTime);
                filter.Q.setValueAtTime(1.5, audioContext.currentTime);
                
                source.buffer = buffer;
                
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(clap.volume, audioContext.currentTime + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + clap.duration);
                
                source.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                source.start();
                
            }, clap.delay * 1000);
        });
        
        console.log('👏👏 강력한 추가 박수!');
        
    } catch (error) {
        console.error('추가 박수 재생 실패:', error);
    }
}

// 환호성 효과 재생
function playCheersSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 더 강력한 "와아아!" 환호성 패턴 (여러 명이 환호하는 효과)
        const cheersPattern = [
            // 첫 번째 파도
            { delay: 0.2, duration: 1.0, startFreq: 200, endFreq: 450, volume: 0.3 },
            { delay: 0.4, duration: 0.8, startFreq: 180, endFreq: 400, volume: 0.25 },
            { delay: 0.6, duration: 1.2, startFreq: 220, endFreq: 500, volume: 0.35 },
            { delay: 0.8, duration: 0.9, startFreq: 190, endFreq: 420, volume: 0.28 },
            
            // 두 번째 파도 (더 높고 강하게)
            { delay: 1.3, duration: 1.5, startFreq: 250, endFreq: 600, volume: 0.4 },
            { delay: 1.5, duration: 1.2, startFreq: 230, endFreq: 550, volume: 0.35 },
            { delay: 1.7, duration: 1.8, startFreq: 280, endFreq: 650, volume: 0.45 },
            { delay: 1.9, duration: 1.3, startFreq: 260, endFreq: 580, volume: 0.38 },
            
            // 세 번째 파도 (피날레)
            { delay: 2.8, duration: 2.0, startFreq: 300, endFreq: 700, volume: 0.5 },
            { delay: 3.0, duration: 1.8, startFreq: 280, endFreq: 680, volume: 0.45 },
            { delay: 3.2, duration: 2.2, startFreq: 320, endFreq: 750, volume: 0.55 },
        ];
        
        cheersPattern.forEach((cheer) => {
                    setTimeout(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                const filter = audioContext.createBiquadFilter();
                
                // 사람 목소리 같은 파형
                oscillator.type = 'sawtooth';
                
                // 주파수가 올라가는 효과 (환호성의 특징)
                oscillator.frequency.setValueAtTime(cheer.startFreq, audioContext.currentTime);
                oscillator.frequency.linearRampToValueAtTime(cheer.endFreq, audioContext.currentTime + cheer.duration);
                
                // 목소리 같은 필터
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(800, audioContext.currentTime);
                filter.Q.setValueAtTime(1, audioContext.currentTime);
                
                // 볼륨 조절 (서서히 커졌다 작아지기)
                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(cheer.volume, audioContext.currentTime + 0.1);
                gainNode.gain.linearRampToValueAtTime(cheer.volume * 0.8, audioContext.currentTime + cheer.duration * 0.7);
                gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + cheer.duration);
                
                // 오디오 노드 연결
                oscillator.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + cheer.duration);
                
            }, cheer.delay * 1000);
        });
        
        console.log('🎉 환호성 재생!');
        
    } catch (error) {
        console.error('환호성 재생 실패:', error);
    }
}

// 백업 사운드 재생 함수 (사용 안 함 - 제거됨)

// 축하 효과 정리 함수 (메모리 관리)
function clearCelebrationEffects() {
    const celebrationElements = document.querySelectorAll('.celebration-firework, .celebration-sparkle'); // 축하 효과 요소들 선택
    celebrationElements.forEach(el => { // 각 요소에 대해
        if (el.parentNode) { // 요소가 DOM에 있으면
            el.parentNode.removeChild(el); // 요소 제거
        }
    });
}

// 오디오 컨텍스트 활성화를 위한 첫 사용자 인터랙션 처리
function enableAudio() {
    // 더미 오디오 재생으로 오디오 컨텍스트 활성화
    const dummyAudio = new Audio(); // 더미 오디오 객체 생성
    dummyAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmcfCkOa2ezEdCkGK3zD8NSNPwsVZ7jp66JTFQxIruN2zWzHhf///'; // Base64 인코딩된 더미 오디오 데이터
    dummyAudio.volume = 0.01; // 매우 작은 볼륨 설정
    dummyAudio.play().catch(() => {}); // 재생 시도 (에러 무시)
    
    console.log('오디오 컨텍스트가 활성화되었습니다.'); // 활성화 로그
}

// 첫 클릭/터치 시 오디오 활성화 (브라우저 자동 재생 정책 우회)
document.addEventListener('click', enableAudio, { once: true }); // 클릭 시 한 번만 실행
document.addEventListener('touchstart', enableAudio, { once: true }); // 터치 시 한 번만 실행

// 음료수 증정 메시지 표시 함수
function showPrizeMessage() {
    const prizeMessage = document.getElementById('prize-message');
    if (prizeMessage) {
        // 메시지 표시 (flex로 변경)
        prizeMessage.style.display = 'flex';
        
        // 7초 후 자동으로 사라지게 함 (더 길게 표시)
        setTimeout(() => {
            prizeMessage.style.display = 'none';
        }, 7000);
        
        console.log('🎉 음료수 증정 메시지가 표시되었습니다! 🥤');
    }
}

// 브라우저가 로드되면 앱 초기화 (진입점)
window.addEventListener('load', init); // 페이지 로드 완료 시 init 함수 실행 