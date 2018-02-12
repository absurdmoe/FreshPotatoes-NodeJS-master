const sqlite = require('sqlite'),
      Sequelize = require('sequelize'),
      request = require('request'),
      express = require('express'),
      app = express();


const { PORT=3000, NODE_ENV='development', DB_PATH='./db/database.db' } = process.env;

const APIURL = 'https://credentials-api.generalassemb.ly/4576f55f-c427-4cfc-a11c-5bfe914ca6c1?films=';


// START SERVER
Promise.resolve()
  .then(() => app.listen(PORT, () => console.log(`App listening on port ${PORT}`)))
  .catch((err) => { if (NODE_ENV === 'development') console.error(err.stack); });

const sequelize = new Sequelize('', '', '', {
  host: '',
  dialect: 'sqlite',
  define: {
    timestamps: false
  },
  storage: './db/database.db'
});
sequelize.authenticate();

const Film = sequelize.define('Films', {
	id: { type: Sequelize.INTEGER, primaryKey: true },
    title: Sequelize.STRING,
    release_date: Sequelize.DATE,
    tagline: Sequelize.STRING,
    revenue: Sequelize.BIGINT, //same as bignum in the sqllite terminal
    budget: Sequelize.BIGINT,
    runtime: Sequelize.INTEGER,
    original_language: Sequelize.STRING,
    status: Sequelize.STRING,
    genre_id: Sequelize.INTEGER
});

const Genre = sequelize.define('Genres', {
		name: Sequelize.STRING
});

function fifteenYearDateDetermine(date){
  let seperatedDate = date.split('-');
  let fifteenYearsLaterYear = parseInt(seperatedDate[0]) + 15;
  let fifteenYearsEarlierYear = parseInt(seperatedDate[0] - 15);
  
  let lateDate = fifteenYearsLaterYear + '-' + seperatedDate[1] + '-' + seperatedDate[2];
  let earlyDate = fifteenYearsEarlierYear + '-' + seperatedDate[1] + '-' + seperatedDate[2];
  
  return { earlyDate, lateDate,}
}


let filterList = (films,reviews, genre) => {
  let filtered = [];
  for(let i = 0; i <= films.length -1; i++){
    for(let z = 0; z <= reviews.length -1; z++){
      if(films[i].id === reviews[z].id){
        filtered.push({
          id: films[i].id,
          title: films[i].title,
          releaseDate: films[i].release_date,
          genre,
          averageRating: parseFloat(parseFloat(reviews[z].averageRating.toFixed(2)).toString()), //this weird syntax is to get the test to past because the tests were very specific on decimal places
          reviews: reviews[z].reviewsLength
        })
      }
    }
  }
  return filtered;
}

let limitFilter = (limit,recommendations) => {
	let filter = [];
	for(let i = 0; i < limit; i ++){
		filter.push(recommendations[i]);
	}
	return filter;
}

let offsetFilter = (offset, recommendations) =>{
	let filter = [];
	for(let i = offset; i < recommendations.length; i++) {
		filter.push(recommendations[i]);
	}
	return filter;
}

// ROUTES
app.get('/films/:id/recommendations', getFilmRecommendations);
app.get('*', nothingHere);

function nothingHere(req,res) {
	res.status(404).json({ "message" :  "key missing" });
}

function getAverageRating(arr){
	let sum = 0;
	arr.forEach(r => sum += r.rating);
	return sum/arr.length;
}

// ROUTE HANDLER
function getFilmRecommendations(req, res) {


	let offset = req.query.offset || 0; // the README specifies that offset should be 1 by default but the test requires it to be 0
	let limit = req.query.limit || 10;
	let chosenFilm;
	let filteredFilms = [];

	Film.findById(req.params.id).then(f => {
		chosenFilm = {
			genre_id: f.genre_id,
			release_date: f.release_date
		}

		Genre.findOne({ where: {id: chosenFilm.genre_id}}).then(g =>{ chosenFilm.genre = g.name })

	})
	.then(() => {
		let attributes = ['id', 'title','release_date'];
		let dateRanges = fifteenYearDateDetermine(chosenFilm.release_date);
		let where = {
			genre_id: chosenFilm.genre_id,
			release_date: {$between: [dateRanges.earlyDate,dateRanges.lateDate]}
		};
		let order = [['id','ASC']];

		Film.findAll({ attributes, where, order,}).then((films) => {

			let film_ids = [];
			films.forEach(f => film_ids.push(f.id));
			let joinedFilmIds = film_ids.join(',');
			let acceptedFilmData = [];

			request(APIURL + joinedFilmIds,(error, response, body) => {
				let reviewData = JSON.parse(body);
				reviewData.forEach((data) =>{
					if(data.reviews.length >= 5 && (getAverageRating(data.reviews) > 4)){
						acceptedFilmData.push({
							averageRating: getAverageRating(data.reviews),
							id: data.film_id,
							reviewsLength: data.reviews.length
						})

					}
				}) // end of reviewData.forEach

				if(req.query.limit){
					res.json({
						"recommendations": limitFilter(req.query.limit || 10, filterList(films, acceptedFilmData, chosenFilm.genre)),
						"meta": {
							"limit": parseInt(limit),
							"offset": parseInt(offset)
						}
					})
				}else if(req.query.offset){
					res.json({
						"recommendations": offsetFilter(req.query.offset || 1, filterList(films, acceptedFilmData, chosenFilm.genre)),
						"meta": {
							"limit": parseInt(limit),
							"offset": parseInt(offset)
						}
					})
				}else{
					res.json({
						"recommendations": filterList(films, acceptedFilmData, chosenFilm.genre),
						"meta": {
							"limit": parseInt(limit),
							"offset": parseInt(offset)
						}
					})
				}

			})// end of request method
		})
	})
	.catch((err => {
		res.status(422).json({ "message" :  "key missing" });
	}));

}

module.exports = app;

