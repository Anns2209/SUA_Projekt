import Link from 'next/link';

export default function Home() {
  return (
    <div className="card">
      <h1>Dobrodošli v Gostilni</h1>
      <p>Oglejte si ponudbo jedi in oddajte naročilo.</p>
      <Link href="/menu">Odpri meni</Link>
    </div>
  );
}
