# 데모 매물 사진

`scripts/seed-demo-data.mjs`가 Supabase Storage(`item-photos` 버킷)로 업로드하는 원본.
전부 Wikimedia Commons에서 받아 900px 폭으로 리사이즈 + JPEG 78% 압축했다(원본은 커밋 안 함).

| 파일 | 출처 | 라이선스 | 저작자 |
|---|---|---|---|
| `table.jpg` | [File:Back side table pine top with mango wood legs side.png](https://commons.wikimedia.org/wiki/File:Back_side_table_pine_top_with_mango_wood_legs_side.png) | CC0 1.0 (퍼블릭 도메인) | — |
| `books.jpg` | [File:College Textbooks.jpg](https://commons.wikimedia.org/wiki/File:College_Textbooks.jpg) | CC BY-SA 4.0 | Inayaysad |
| `pans.jpg` | [File:Castiron-skillets.jpg](https://commons.wikimedia.org/wiki/File:Castiron-skillets.jpg) | 퍼블릭 도메인 | FiveRings |
| `plant.jpg` | [File:Amaryllis (Hippeastrum) 18-01-2025. (actm.) 04.jpg](https://commons.wikimedia.org/wiki/File:Amaryllis_(Hippeastrum)_18-01-2025._(actm.)_04.jpg) | CC BY-SA 4.0 | Agnes Monkelbaan |
| `lamp.jpg` | [File:A desk lamp.jpg](https://commons.wikimedia.org/wiki/File:A_desk_lamp.jpg) | CC BY-SA 4.0 | AirbusA330772673 |

**CC BY-SA 4.0인 3장(books/plant/lamp)은 재배포 시 저작자 표시가 필요하다.** 앱 안(dev DB
데모 데이터)에서 쓰는 건 문제없지만, 이 스크린샷을 포트폴리오 글 등 **외부에 공개로 게시할
때는** 위 표의 출처·저작자를 캡션이나 각주로 함께 밝힐 것.
