import "./style.css";
export const metadata = {
  title: "Workday | 新入社員の経験から知る仕事",
  description: "新入社員の回答をもとに、入社前の期待と現場の働き方を照合する",
};
export default function Layout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
