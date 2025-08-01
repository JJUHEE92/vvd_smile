// DOM 요소
const video = document.getElementById('video');
const canvas = document.getElementById('face-points');
const ctx = canvas.getContext('2d');
const scoreValue = document.getElementById('score-value');
const message = document.getElementById('message');
const messageCamera = document.getElementById('message-camera');
const videoWrapper = document.getElementById('video-wrapper');

// 앱 상태 변수
let isRunning = false;
let currentScore = 80;
let isMobile = window.innerWidth <= 480;

// 전역 카메라 상태 관리
window.cameraInitializing = false;
window.cameraStreamActive = false;

// 브라우저 환경 감지
const isDesktopBrowser = !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid = /Android/.test(navigator.userAgent);

// 창 크기 변경 감지
window.addEventListener('resize', () => {
    isMobile = window.innerWidth <= 480;
    if (video.videoWidth > 0) {
        resizeCanvas();
    }
});

// 캔버스 크기 조정 함수
function resizeCanvas() {
    const wrapperWidth = videoWrapper.clientWidth;
    const wrapperHeight = videoWrapper.clientHeight;
    
    // 비디오 비율 계산
    const videoRatio = video.videoWidth / video.videoHeight;
    const wrapperRatio = wrapperWidth / wrapperHeight;
    
    let canvasWidth, canvasHeight;
    
    if (videoRatio > wrapperRatio) {
        // 비디오가 더 넓은 경우
        canvasHeight = wrapperHeight;
        canvasWidth = wrapperHeight * videoRatio;
    } else {
        // 비디오가 더 좁은 경우
        canvasWidth = wrapperWidth;
        canvasHeight = wrapperWidth / videoRatio;
    }
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // 캔버스 위치 조정 (중앙 정렬)
    canvas.style.left = `${(wrapperWidth - canvasWidth) / 2}px`;
    canvas.style.top = `${(wrapperHeight - canvasHeight) / 2}px`;
    
    console.log(`캔버스 크기 조정: ${canvasWidth} x ${canvasHeight}`);
}

// Face-API.js 모델 로드 및 앱 초기화
async function init() {
    try {
        console.log("앱 초기화 시작: 브라우저 환경 - " + (isDesktopBrowser ? "데스크톱" : "모바일"));
        
        // 이미 카메라가 활성화되어 있는지 확인
        if (window.cameraStreamActive) {
            console.log("카메라가 이미 활성화되어 있습니다. 초기화 생략.");
            
            // 이미 카메라가 작동 중이라면 얼굴 감지만 시작
            if (!isRunning) {
                isRunning = true;
                startFaceDetection();
            }
            
            messageCamera.innerText = '얼굴을 카메라에 맞춰주세요';
            return;
        }
        
        // 메시지 요소 확인
        if (!messageCamera) {
            console.error("카메라 메시지 요소를 찾을 수 없습니다");
            return;
        }
        
        messageCamera.innerText = '모델을 로딩하는 중...';
        
        // 모델 URL (CDN에서 모델 로드)
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        
        console.log("Face-API.js 모델 로딩 시작");
        
        // 모델 로드
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]).catch(err => {
            console.error("모델 로드 중 오류:", err);
            messageCamera.innerText = '모델 로드 중 오류가 발생했습니다: ' + err.message;
            throw err;
        });
        
        console.log("Face-API.js 모델 로딩 완료");
        
        messageCamera.innerText = '카메라 시작 중...';
        
        // 카메라 초기화
        await setupCamera();
        
        // 얼굴 감지 시작
        isRunning = true;
        startFaceDetection();
        
        messageCamera.innerText = '얼굴을 카메라에 맞춰주세요';
    } catch (error) {
        console.error('초기화 실패:', error);
        messageCamera.innerText = '카메라 접근에 실패했습니다: ' + error.message;
        
        // 재시도 버튼 표시
        const retryButton = document.getElementById('retry-camera-button');
        if (retryButton) {
            retryButton.style.display = 'block';
        }
    }
}

// 카메라 설정
async function setupCamera() {
    try {
        // 이미 카메라 스트림이 활성화되어 있으면 중복 초기화 방지
        if (window.cameraStreamActive && video.srcObject) {
            console.log("카메라가 이미 활성화되어 있습니다. setupCamera 호출 무시");
            return Promise.resolve();
        }
        
        // 각 플랫폼별 제약 조건 설정
        let constraints = { 
            video: { 
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };
        
        // 모바일 기기별 특수 설정 적용
        if (isIOS) {
            console.log("iOS 특수 설정 적용");
            constraints.video = {
                facingMode: 'user',
                width: { min: 320, ideal: 640, max: 1280 },
                height: { min: 240, ideal: 480, max: 720 }
            };
        } else if (isAndroid) {
            console.log("안드로이드 특수 설정 적용");
            constraints.video = {
                facingMode: 'user',
                width: { min: 320, ideal: 640, max: 1280 },
                height: { min: 240, ideal: 480, max: 720 }
            };
        }
        
        // 카메라 스트림 가져오기
        console.log("카메라 스트림 요청 중...");
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // 비디오 요소 설정
        video.srcObject = stream;
        video.setAttribute('playsinline', true); // iOS에서 중요
        video.setAttribute('autoplay', true);
        video.muted = true;
        
        // 전역 플래그 설정
        window.cameraStreamActive = true;
        
        // 비디오 로드 완료 대기
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // 캔버스 크기 조정
                resizeCanvas();
                
                // 비디오 재생
                video.play()
                    .then(() => {
                        console.log("카메라 초기화 성공");
                        resolve();
                    })
                    .catch(error => {
                        console.error("비디오 재생 오류:", error);
                        // 오류가 발생해도 성공한 것으로 처리 (iOS에서 중요)
                        resolve();
                    });
            };
            
            // 비디오 오류 처리
            video.onerror = (err) => {
                console.error("비디오 요소 오류:", err);
                throw new Error("비디오 요소 오류");
            };
        });
    } catch (error) {
        console.error("카메라 접근 오류:", error.name, error.message);
        throw error;
    }
}

// 얼굴 감지 및 표정 분석 시작
function startFaceDetection() {
    isRunning = true;
    detectFace();
}

// 실시간 얼굴 감지 및 분석
async function detectFace() {
    if (!isRunning) return;
    
    try {
        const detections = await faceapi.detectSingleFace(
            video, 
            new faceapi.TinyFaceDetectorOptions({
                inputSize: isMobile ? 224 : 320,
                scoreThreshold: 0.5
            })
        ).withFaceLandmarks();
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (detections) {
            const displaySize = { width: canvas.width, height: canvas.height };
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            
            analyzeSmile(resizedDetections);
        } else {
            messageCamera.innerText = '얼굴이 감지되지 않았습니다';
        }
        
        requestAnimationFrame(detectFace);
    } catch (error) {
        console.error('얼굴 감지 오류:', error);
        messageCamera.innerText = '얼굴 감지 중 오류가 발생했습니다';
        setTimeout(() => {
            if (isRunning) detectFace();
        }, 2000); // 에러 발생 시 2초 후 재시도
    }
}

// 점 그리기 헬퍼 함수
function drawPoints(points, radius, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < points.length; i++) {
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, radius, 0, 2 * Math.PI);
        ctx.fill();
    }
}

// 웃음/찡그림 분석하기
function analyzeSmile(detections) {
    const mouth = detections.landmarks.getMouth();
    
    // 입 모양 분석을 위한 주요 포인트
    const topLip = mouth[14];    // 윗입술 중앙
    const bottomLip = mouth[18]; // 아랫입술 중앙
    const leftCorner = mouth[0]; // 왼쪽 입꼬리
    const rightCorner = mouth[6];// 오른쪽 입꼬리
    
    // 입 크기 계산
    const mouthHeight = Math.abs(bottomLip.y - topLip.y);
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);
    const mouthRatio = mouthWidth / mouthHeight;
    
    // 입꼬리 위치 분석 (U자형 vs 역U자형)
    const lipCenter = (topLip.y + bottomLip.y) / 2;
    const cornerHeight = (leftCorner.y + rightCorner.y) / 2;
    const lipCurve = (lipCenter - cornerHeight) / mouthHeight; // 정규화된 곡률

    // 입술 두께 변화 감지 (찡그림 시 입술이 얇아짐)
    const lipThickness = mouthHeight / mouthWidth;

    // 디버깅 정보 출력
    console.log('입 비율:', mouthRatio.toFixed(2));
    console.log('입꼬리 곡률:', lipCurve.toFixed(2));
    console.log('입술 두께:', lipThickness.toFixed(2));

    // 점수 계산
    let baseScore = 80; // 기본 점수
    let smileScore = baseScore;
    let scoreAdjustment = 0;

    // 웃는 표정 (U자형, 입꼬리가 올라감)
    if (lipCurve > 0) {
        if (lipCurve > 0.4 && mouthRatio > 2.0) {
            scoreAdjustment = 15; // 활짝 웃는 얼굴 (95점)
        }
        else if (lipCurve > 0.25 && mouthRatio > 1.7) {
            scoreAdjustment = 10; // 기분 좋게 웃는 얼굴 (90점)
        }
        else if (lipCurve > 0.1) {
            scoreAdjustment = 5;  // 살짝 웃는 얼굴 (85점)
        }
    }
    // 찡그린 표정 (역U자형, 입꼬리가 내려감)
    else {
        if (lipCurve < -0.2 && (mouthRatio < 1.3 || lipThickness < 0.3)) {
            scoreAdjustment = -20; // 많이 찡그린 얼굴 (60점)
        }
        else if (lipCurve < -0.15 && mouthRatio < 1.5) {
            scoreAdjustment = -15; // 조금 찡그린 얼굴 (65점)
        }
        else if (lipCurve < -0.1) {
            scoreAdjustment = -10; // 살짝 찡그린 얼굴 (70점)
        }
        else if (lipCurve < -0.05) {
            scoreAdjustment = -5;  // 아주 살짝 찡그린 얼굴 (75점)
        }
    }

    // 최종 점수 계산
    smileScore = Math.max(60, Math.min(95, baseScore + scoreAdjustment));

    // 점수 변화를 더 민감하게 조정 (이전 가중치 조정)
    currentScore = currentScore * 0.5 + smileScore * 0.5;
    
    // 점수 표시 업데이트
    scoreValue.style.fontWeight = 'bold';
    scoreValue.style.color = '#3498db';  // 항상 파란색으로 표시
    scoreValue.innerText = Math.round(currentScore);
    
    // 메시지 업데이트
    updateMessage(currentScore);
}

// 점수에 따른 메시지 업데이트
function updateMessage(score) {
    const roundedScore = Math.round(score);
    message.style.fontWeight = 'bold';
    message.style.color = '#3498db';  // 메시지도 파란색으로 통일
    
    if (roundedScore >= 95) {
        message.innerText = '활짝 웃는 얼굴이에요! 😊';
    } else if (roundedScore >= 90) {
        message.innerText = '기분 좋게 웃고 있어요! 😄';
    } else if (roundedScore >= 85) {
        message.innerText = '살짝 웃고 있네요! 🙂';
    } else if (roundedScore >= 80) {
        message.innerText = '자연스러운 표정이에요. 😌';
    } else if (roundedScore >= 75) {
        message.innerText = '살짝 찡그리고 있어요. 😕';
    } else if (roundedScore >= 70) {
        message.innerText = '조금 찡그리고 있어요. 😣';
    } else if (roundedScore >= 65) {
        message.innerText = '많이 찡그리고 있어요. 😖';
    } else {
        message.innerText = '너무 찡그리고 있어요! 힘내세요! 😫';
    }
}

// 카메라 재시도 함수
function retryCamera() {
    // 재시도 버튼 숨기기
    const retryButton = document.getElementById('retry-camera-button');
    if (retryButton) {
        retryButton.style.display = 'none';
    }
    
    // 기존 카메라 스트림 정리
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // 기존 초기화 플래그 제거
    window.cameraInitializing = false;
    window.cameraStreamActive = false;
    
    // 1초 후 다시 시도
    setTimeout(() => {
        init();
    }, 1000);
}

// 브라우저가 로드되면 앱 초기화
window.addEventListener('load', init); 