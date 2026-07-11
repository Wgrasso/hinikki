// Unit tests for the transcript name→face matcher. Pure logic, no SDK.
import { matchPersonPhotos, type PersonPhoto } from "./personPhotos";

const els: PersonPhoto = { name: "Els Bakker", photoUri: "els.jpg" };
const tom: PersonPhoto = { name: "Tom", photoUri: "tom.jpg" };
const marie: PersonPhoto = { name: "Marie", photoUri: "marie.jpg" };
const people = [marie, els, tom]; // deliberately not in "spoken" order

test("matches a single named person by first word", () => {
  expect(matchPersonPhotos("I had coffee with Els today", people)).toEqual([els]);
});

test("returns every named person, in order of appearance (not list order)", () => {
  expect(matchPersonPhotos("I saw Els and then Tom", people)).toEqual([els, tom]);
  expect(matchPersonPhotos("Tom came before Els", people)).toEqual([tom, els]);
});

test("matches the full stored name too", () => {
  expect(matchPersonPhotos("Els Bakker phoned", people)).toEqual([els]);
});

test("names a person at most once even if repeated", () => {
  expect(matchPersonPhotos("Tom, oh Tom, dear Tom", people)).toEqual([tom]);
});

test("is whole-word and case-insensitive; no partial hits", () => {
  expect(matchPersonPhotos("tomorrow we rest", people)).toEqual([]); // 'tom' inside 'tomorrow'
  expect(matchPersonPhotos("MARIE is here", people)).toEqual([marie]);
});

test("returns empty when nobody is named", () => {
  expect(matchPersonPhotos("the weather is lovely", people)).toEqual([]);
});
