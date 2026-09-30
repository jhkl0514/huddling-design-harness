# 허들링 디자인 하네스

화면 주제 1개를 받아, PRD 16장 핵심 화면 중 그 주제에 해당하는 모든 화면을 템플릿 Figma 파일의
주제 페이지에 390×844 프레임으로 만든다. design.md 위반 0건, ★1·★2 위반 0건, 팀장 승인 1건이면 완료.

## 트리거

- "○○ 화면 하네스 돌려줘" → 새 실행 · "이어서 해줘" → state.json 기준 재개 · "컨펌 받았어" → HUMAN 재판정
- 세 경우 모두 `.claude/skills/run-harness/SKILL.md` 절차를 따른다.

## 파이프라인

P1 리서치(researcher) → P2 설계(planner) → P3 키스크린(keyscreen) → 👤 컨셉 확정(팀장)
→ P4 시스템(system) → P5 화면 디자인(screens). 모든 게이트 판정은 judge.

## 파일 역할

| 파일 | 쓰는 쪽 |
|---|---|
| docs/*, harness/*, .claude/*, CLAUDE.md | 사람 (.harness-unlock 있을 때만) |
| runs/<slug>/input.md | 메인 세션 (첫 실행) |
| runs/<slug>/p*/*.md·json | 메인 세션 — 에이전트 블록을 그대로, 그 에이전트 폴더에만 |
| runs/<slug>/p*/figma-snapshot.json | judge (save-snapshot.mjs) |
| state.json, verdicts/, approval-request.md | verify.mjs만 |
| approval.md | 팀장만 |

## 기준

- 판정 수치·허용 목록: harness/rules.yaml (SSOT). 다른 문서에 수치를 새로 적지 않는다.
- 서비스 기준: docs/story-service.md (★1·★2) · 작업 흐름: docs/story-work.md
- 회귀 테스트: `npm test` (게이트 판정 + hook 차단)

## 절대 금지

- approval.md 작성·승인 추정 · state.json·verdicts 수정 · rules.yaml 수치 변경으로 통과시키기
- judge 판정 없이 통과 선언 · 차단(exit 3)을 스스로 해제
