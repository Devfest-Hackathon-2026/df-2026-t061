# Workday 公開後の停止手順

対象は devfest-512005 の workday サービス、東京 asia-northeast1。

## 一時的に外部公開を止める

次の操作はデータを保持して外部からのアクセスを遮断する。内部からの呼び出しは可能なため、Cloud Runサービス自体の削除と同じ効果ではない。

    gcloud run services update workday --project devfest-512005 --region asia-northeast1 --ingress internal --min=0

Cloud Runの設定で ingress が internal に変わったことを確認し、一般のブラウザーから公開URLにアクセスできなくなったことを確認する。設定反映前に開始した処理は終了まで動く場合がある。

Geminiの生成だけを止める場合は、Firestoreコンソールで workday-config/inference の expiresAt を 0 にする。新しい実行枠は予約できなくなり、実行中のリクエストは終了する。保存済み結果は読める。

## サービスの実行を終了する

次の操作はCloud Runのサービスとリビジョンを削除するため、実施前に承認を得る。

    gcloud run services delete workday --project devfest-512005 --region asia-northeast1

Cloud Runの一覧からサービスが消えたことを確認する。Firestoreのデータ、コンテナーイメージ、ビルドのソースやログは別のリソースであり、この操作で削除されない。

## 保存費用も整理する場合

Firestoreの保存量、Artifact Registryのイメージ、Cloud Buildのソース保管バケットを確認する。不要なデータやイメージの削除は、対象を特定し、社員回答などの必要データを退避してから個別承認を得て行う。Firestoreのバックアップ・PITR・TTLは今回有効化しない。DBは Standard edition の (default) を使用する。

最小0インスタンスでも、データ・イメージの保管、既存の費用、処理中のリクエストには費用が残る場合がある。請求レポートには反映遅延があるため、停止後も対象サービスと保管量を確認する。予算監視は全費用の即時停止を保証するものではない。
