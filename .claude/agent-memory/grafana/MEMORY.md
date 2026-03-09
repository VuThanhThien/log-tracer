# Setel Grafana

## API Configuration

- here is an sample link for grafana log to search log for kubernetes_container_name is api-payment with line contain text f256b24a-ba38-4e2a-9f88-01263fa22b06: https://grafana.ops.com/explore?schemaVersion=1&panes=%7B%22rzu%22%3A%7B%22datasource%22%3A%22v228AsnVk%22%2C%22queries%22%3A%5B%7B%22refId%22%3A%22A%22%2C%22datasource%22%3A%7B%22type%22%3A%22loki%22%2C%22uid%22%3A%22v228AsnVk%22%7D%2C%22editorMode%22%3A%22builder%22%2C%22expr%22%3A%22%7Bkubernetes_container_name%3D%5C%22api-payments%5C%22%7D+%7C%3D+%60f256b24a-ba38-4e2a-9f88-01263fa22b06%60%22%2C%22queryType%22%3A%22range%22%2C%22direction%22%3A%22forward%22%7D%5D%2C%22range%22%3A%7B%22from%22%3A%221772730000000%22%2C%22to%22%3A%221772816399000%22%7D%2C%22panelsState%22%3A%7B%22logs%22%3A%7B%22visualisationType%22%3A%22logs%22%7D%7D%7D%7D&orgId=1 

This page will return response in javascript instead of http api so cannot get data by api, so need to crawl data by pupeteer to get data

- Log error element showing in grafana should have background-color: rgb(226, 77, 66) or red, statusCode 4xx or 5xx, errorCode existed or level error

- Search relative error: when you're searching log for one service and found error log from other service, for example you're searching log in api-payments and saw log threw from api-merchants, then open new tab with same url and change kubernetes_container_name to related service

- after crawl all logs from the link, you should summary the logs and explain the issue/ error if existed of what service