export default function EmployeeQuotes({ ids, facts, respondents }) {
  return ids.map((id) => {
    const f = facts.find((x) => x.id === id);
    return (
      f && (
        <blockquote key={id}>
          <small>
            {respondents.get(f.employee)} ／ {f.role}・{f.division} ／ {f.year}年入社 ／{" "}
            {f.label}
          </small>
          {f.text}
        </blockquote>
      )
    );
  });
}
