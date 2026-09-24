export type Film = {
  id: string
  vimeoId: string
  title: string
  poster: string
  year: string
  duration: string
  genre: string
  country: string
  director: string
  writer: string
  cast: string[]
  synopsis: string
}

/* Ficha técnica sacada de IMDb (tt14575162) */
export const FILMS: Film[] = [
  {
    id: "enfermo-amor",
    vimeoId: "727564959",
    title: "Enfermo Amor",
    poster: "/films/enfermo-amor.webp",
    year: "2022",
    duration: "2h 0min",
    genre: "Comedia, Romance",
    country: "México",
    director: "Marco Polo Constandse, Rodrigo Nava",
    writer: "John Cariani, Ovidio De León",
    cast: [
      "Estefanía Hinojosa", "Gonzalo Vega Jr.", "Natalia Téllez", "Luis Arrieta",
      "Paco Rueda", "Jesús Zavala", "Cassandra Sánchez-Navarro", "Daniel Tovar",
    ],
    synopsis: "La historia de las luchas amorosas de 9 parejas diferentes, conectadas solo por la complejidad de las relaciones humanas.",
  },
]
