const WORKER_BASE_URL = 'https://inlefel.sjo579235.workers.dev';

// 모든 소행성 카드에 사용할 대표 이미지
const UNIFIED_ASTEROID_IMAGE = "https://images-assets.nasa.gov/image/PIA00136/PIA00136~orig.jpg";

let rawAsteroidData = [];
let currentAnimationFrameId = null;

// 한국어 번역 헬퍼 함수
async function translateToKorean(text) {
    if (!text) return '';
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        return data[0].map(item => item[0]).join('');
    } catch (error) {
        console.error('번역 실패:', error);
        return text;
    }
}

// 1. 오늘의 천문사진 (APOD)
async function getAPOD() {
    const apodLoading = document.getElementById('apod-loading');
    const apodContainer = document.getElementById('apod-container');
    const apodMedia = document.getElementById('apod-media');
    const apodTitle = document.getElementById('apod-title');
    const apodDate = document.getElementById('apod-date');
    const apodExplanation = document.getElementById('apod-explanation');

    const url = `${WORKER_BASE_URL}/apod`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`APOD Error: ${response.status}`);

        const data = await response.json();

        if (data.media_type === 'image') {
            apodMedia.innerHTML = `
                <a href="https://apod.nasa.gov/apod/astropix.html" target="_blank" rel="noopener noreferrer">
                    <img src="${data.url}" alt="${data.title}" style="cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                </a>
            `;
        } else if (data.media_type === 'video') {
            apodMedia.innerHTML = `<iframe src="${data.url}" style="height: 400px;" allowfullscreen></iframe>`;
        }

        apodDate.textContent = `촬영 일자: ${data.date}`;

        apodTitle.textContent = '번역 중...';
        apodExplanation.textContent = '설명을 한국어로 번역하고 있습니다...';

        const [translatedTitle, translatedExplanation] = await Promise.all([
            translateToKorean(data.title),
            translateToKorean(data.explanation)
        ]);

        apodTitle.textContent = translatedTitle;
        apodExplanation.textContent = translatedExplanation;

        if (apodLoading) apodLoading.style.display = 'none';
        if (apodContainer) apodContainer.style.display = 'block';

    } catch (error) {
        console.error('천문사진 불러오기 실패:', error);
        if (apodLoading) apodLoading.textContent = '천문사진을 불러오는 데 실패했습니다.';
    }
}

// 2. 근지구 소행성 (NEO)
async function getNEO() {
    const neoLoading = document.getElementById('neo-loading');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    const url = `${WORKER_BASE_URL}/neo?date=${today}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`NEO Error: ${response.status}`);

        const data = await response.json();
        
        if (!data.near_earth_objects || !data.near_earth_objects[today]) {
            if (neoLoading) neoLoading.textContent = '오늘의 소행성 데이터가 존재하지 않습니다.';
            return;
        }

        rawAsteroidData = data.near_earth_objects[today];
        
        setupSortEvent();
        renderAndAnimate('distance-desc');

        if (neoLoading) neoLoading.style.display = 'none';

    } catch (error) {
        console.error('소행성 불러오기 실패:', error);
        if (neoLoading) neoLoading.textContent = '소행성 데이터를 불러오는 데 실패했습니다.';
    }
}

// 3. 정렬 이벤트 처리
function setupSortEvent() {
    const sortSelect = document.getElementById('sort-select');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', (e) => {
        renderAndAnimate(e.target.value);
    });
}

// 4. 데이터 정렬 함수
function sortAsteroids(asteroids, sortBy) {
    return [...asteroids].sort((a, b) => {
        const approachA = a.close_approach_data[0];
        const approachB = b.close_approach_data[0];

        const distA = approachA ? parseFloat(approachA.miss_distance.kilometers) : 0;
        const distB = approachB ? parseFloat(approachB.miss_distance.kilometers) : 0;

        const sizeA = a.estimated_diameter.meters.estimated_diameter_max;
        const sizeB = b.estimated_diameter.meters.estimated_diameter_max;

        const speedA = approachA ? parseFloat(approachA.relative_velocity.kilometers_per_hour) : 0;
        const speedB = approachB ? parseFloat(approachB.relative_velocity.kilometers_per_hour) : 0;

        // 위험 여부 (true = 1, false = 0으로 변환하여 비교)
        const hazardA = a.is_potentially_hazardous_asteroid ? 1 : 0;
        const hazardB = b.is_potentially_hazardous_asteroid ? 1 : 0;

        switch (sortBy) {
            case 'hazard-desc': 
                // 위험한 소행성(1)이 먼저 오도록 정렬하고, 위험도가 같으면 거리순(가까운 순)으로 정렬
                if (hazardB !== hazardA) {
                    return hazardB - hazardA;
                }
                return distA - distB;

            case 'distance-asc': return distA - distB;
            case 'distance-desc': return distB - distA;
            case 'size-desc': return sizeB - sizeA;
            case 'size-asc': return sizeA - sizeB;
            case 'speed-desc': return speedB - speedA;
            case 'speed-asc': return speedA - speedB;
            default: return distB - distA;
        }
    });
}

// 5. 렌더링 및 애니메이션 준비
function renderAndAnimate(sortBy) {
    const listElement = document.getElementById('neo-list');
    if (!listElement) return;

    listElement.innerHTML = '';

    const sorted = sortAsteroids(rawAsteroidData, sortBy);

    sorted.forEach((asteroid, index) => {
        const isHazardous = asteroid.is_potentially_hazardous_asteroid;
        const name = asteroid.name;
        const size = Math.round(asteroid.estimated_diameter.meters.estimated_diameter_max);
        
        const approachData = asteroid.close_approach_data[0];
        const speed = approachData ? Math.round(approachData.relative_velocity.kilometers_per_hour) : 0;
        const distance = approachData ? Math.round(approachData.miss_distance.kilometers) : 0;

        const detailUrl = asteroid.nasa_jpl_url || "https://ssd.jpl.nasa.gov/";

        const li = document.createElement('li');
        li.className = 'asteroid-card'; 
        li.style.padding = '24px';
        li.style.marginBottom = '20px';
        li.style.borderRadius = '12px';
        li.style.backgroundColor = '#21262d';
        li.style.borderLeft = isHazardous ? '8px solid #ff4d4d' : '8px solid #4caf50';
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '24px';

        // 요소 생성 시 데이터 속성(data-*)으로 목표 수치를 저장해 둡니다.
        li.dataset.targetDistance = distance;
        li.dataset.targetSize = size;
        li.dataset.targetSpeed = speed;

        li.innerHTML = `
            <a href="${detailUrl}" target="_blank" rel="noopener noreferrer" style="flex-shrink: 0;">
                <img src="${UNIFIED_ASTEROID_IMAGE}" alt="소행성" style="width: 100px; height: 100px; object-fit: cover; border-radius: 10px; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            </a>
            <div style="flex-grow: 1;">
                <div style="font-weight: bold; font-size: 1.4rem; color: #ffffff; margin-bottom: 8px;">
                    <a href="${detailUrl}" target="_blank" rel="noopener noreferrer" style="color: #ffffff; text-decoration: none;">
                        ${name}
                    </a> 
                    ${isHazardous ? '<span style="color: #ff4d4d;">(위험)</span>' : '<span style="color: #4caf50;">(안전)</span>'}
                </div>
                <div style="color: #a3b1c2; font-size: 1.1rem; line-height: 1.7;">
                    추정 크기: 약 <strong style="color: #8ff8ffff;"><span class="num-size">0</span>m</strong><br>
                    접근 거리: 지구에서 약 <strong style="color: #ffeeffff; font-size: 1.25rem;"><span class="num-dist">0</span> km</strong><br>
                    이동 속도: 약 <strong style="color: #ffbd5bff;"><span class="num-speed">0</span> km/h</strong>
                </div>
            </div>
        `;

        listElement.appendChild(li);
    });

    // 카드 생성이 끝난 후 스크롤 감지기 등록
    setupScrollObserver();
}

// 스크롤 감지 및 개별 카드 애니메이션 실행 함수
function setupScrollObserver() {
    const cards = document.querySelectorAll('.asteroid-card');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const card = entry.target;

            if (entry.isIntersecting) {
                // 화면에 보이면 카드 등장
                card.classList.add('show');

                // 스크롤 내려서 화면에 보일 때 숫자가 올라가기 시작하도록 호출
                animateCardNumbers(card);
            } else {
                // 화면 밖으로 나가면 등장 클래스 제거 및 숫자 0으로 초기화
                card.classList.remove('show');
                resetCardNumbers(card);
            }
        });
    }, { 
        threshold: 0.2 // 카드가 화면에 20% 이상 보일 때 작동
    });

    cards.forEach(card => observer.observe(card));
}

// 개별 카드의 숫자를 0으로 초기화하는 함수
function resetCardNumbers(card) {
    if (card.animationFrame) {
        cancelAnimationFrame(card.animationFrame);
    }
    const distEl = card.querySelector('.num-dist');
    const sizeEl = card.querySelector('.num-size');
    const speedEl = card.querySelector('.num-speed');

    if (distEl) distEl.textContent = '0';
    if (sizeEl) sizeEl.textContent = '0';
    if (speedEl) speedEl.textContent = '0';
}

// 스크롤 시 카드가 보이면 숫자를 카운트업하는 애니메이션 함수
function animateCardNumbers(card) {
    // 기존 진행 중인 애니메이션 취소
    if (card.animationFrame) {
        cancelAnimationFrame(card.animationFrame);
    }

    const distEl = card.querySelector('.num-dist');
    const sizeEl = card.querySelector('.num-size');
    const speedEl = card.querySelector('.num-speed');

    const targetDist = parseFloat(card.dataset.targetDistance) || 0;
    const targetSize = parseFloat(card.dataset.targetSize) || 0;
    const targetSpeed = parseFloat(card.dataset.targetSpeed) || 0;

    let currDist = 0;
    let currSize = 0;
    let currSpeed = 0;

    // 숫자가 올라가는 속도 (필요시 조절)
    const easeFactor = 0.07; 

    function step() {
        let isFinished = true;

        // 1. 거리
        const distDiff = targetDist - currDist;
        if (distDiff > 0.5) {
            currDist += Math.max(distDiff * easeFactor, 0.5);
            if (currDist > targetDist) currDist = targetDist;
            isFinished = false;
        } else {
            currDist = targetDist;
        }
        if (distEl) distEl.textContent = Math.round(currDist).toLocaleString();

        // 2. 크기
        const sizeDiff = targetSize - currSize;
        if (sizeDiff > 0.5) {
            currSize += Math.max(sizeDiff * easeFactor, 0.2);
            if (currSize > targetSize) currSize = targetSize;
            isFinished = false;
        } else {
            currSize = targetSize;
        }
        if (sizeEl) sizeEl.textContent = Math.round(currSize).toLocaleString();

        // 3. 속도
        const speedDiff = targetSpeed - currSpeed;
        if (speedDiff > 0.5) {
            currSpeed += Math.max(speedDiff * easeFactor, 0.5);
            if (currSpeed > targetSpeed) currSpeed = targetSpeed;
            isFinished = false;
        } else {
            currSpeed = targetSpeed;
        }
        if (speedEl) speedEl.textContent = Math.round(currSpeed).toLocaleString();

        if (!isFinished) {
            card.animationFrame = requestAnimationFrame(step);
        }
    }

    card.animationFrame = requestAnimationFrame(step);
}

// 앱 실행
getAPOD();
getNEO();