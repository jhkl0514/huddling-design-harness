---
name: run-harness
description: 허들링 디자인 하네스 실행. "○○ 화면 하네스 돌려줘", "이어서 해줘", "컨펌 받았어"일 때 사용.
---

# 하네스 실행 절차

## 0. 시작

- 새 실행 ("○○ 화면 하네스 돌려줘")
  1. slug(주제의 영문 kebab-case)를 제안하고 확인받는다.
  2. 템플릿 Figma 파일 URL과 주제 페이지 이름을 묻는다. 추정하지 않는다.
  3. `runs/<slug>/input.md`를 쓴다: 주제, slug, Figma URL, 페이지 이름.
  4. stage = P1.
- 이어서 ("이어서 해줘"): `runs/*/state.json`을 읽고 `stage`부터. 실행이 여러 개면 어느 slug인지 묻는다.
- 컨펌 받았어: judge에게 HUMAN 판정부터.

## 1. 단계 실행 (stage = P1·P2·P3·P4·P5)

| stage | 에이전트 | 저장 가능한 폴더 |
|---|---|---|
| P1 | researcher | runs/<slug>/p1-research/ |
| P2 | planner | runs/<slug>/p2-design/ |
| P3 | keyscreen | runs/<slug>/p3-keyscreens/ |
| P4 | system | runs/<slug>/p4-system/ |
| P5 | screens | runs/<slug>/p5-screens/ |

1. 해당 에이전트를 부른다. slug, 입력 경로, 직전 verdict의 violations, 반려 이유(있으면)를 전달한다.
2. 돌려받은 `=== FILE: 경로 === … === END ===` 블록을 검사한다. 경로가 위 표의 그 에이전트 폴더가 아니거나 `figma-snapshot.json`이면 저장하지 않고 다시 요청한다.
3. 블록 내용을 한 글자도 바꾸지 않고 그대로 저장한다. 보완·수정하지 않는다.
4. judge를 부른다: "<slug> <stage> 판정해줘".

## 2. 판정 결과 처리

| exit | status | 처리 |
|---|---|---|
| 0 | pass | 다음 단계. P3 통과면 `runs/<slug>/approval-request.md` 경로와 hash를 사용자에게 안내하고 멈춘다 |
| 1 | fail | `return_to` 단계의 에이전트에 violations를 전달하고 1-1부터 |
| 1 | waiting | 사람이 할 일(승인 파일 작성 등)을 안내하고 멈춘다 |
| 1 | rejected | 반려 이유를 planner에 전달하고 P2부터 |
| 2 | error | 빠진 파일·형식만 고쳐 1회 재판정. 또 2면 보고하고 멈춘다 |
| 3 | blocked | 즉시 멈추고 verdict 원문을 사용자에게 보고한다. 스스로 풀지 않는다 |

## 3. 완료

P5가 exit 0이면 화면 목록, Figma 링크, 게이트 이력(state.json › history)을 요약해 보고한다.

## 금지

- approval.md 작성, 승인 추정, state.json·verdicts 수정, rules.yaml 수정
- judge 없이 통과 선언, 차단 해제
