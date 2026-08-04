# AGENTS.md

## Clarifications

Khi đưa ra các câu hỏi hoặc tìm kiếm quyết định từ con người, bạn nên đánh giá mức độ quan trọng của câu hỏi. Sau đó chỉ nên tập trung hỏi về Block và High questions thôi:

- Block: không thể đi tiếp được nếu không có câu trả lời
- High: nếu assumption bị sai thì sẽ kéo theo approach của solution bị sai
- Medium: nếu assumption bị sai thì nó sẽ ảnh hưởng tới một module hoặc component
- Low: các ảnh hưởng chỉnh là chi tiết nhỏ hoặc góp ý thêm

## Conventions

- no member comments, single-line imports, no `Omit`.
- always have `data-testid` in html element for the component name.
- no isolated stylesheet for angular component, must use global scss at styles.
- Commits: `<type>(<scope>): <summary>`. Do not over 100 characters in the summary.
