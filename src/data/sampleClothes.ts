export interface ClothingItem {
  id: string;
  name: string;
  category: 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';
  imageUrl: string;
  color: string;
  season: ('spring' | 'summer' | 'fall' | 'winter')[];
  brand?: string;
  lastWorn?: Date;
}

export const sampleClothes: ClothingItem[] = [
  {
    id: '1',
    name: 'White Cotton T-Shirt',
    category: 'tops',
    imageUrl: 'https://fakestoreapi.com/img/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_.jpg',
    color: 'white',
    season: ['spring', 'summer'],
    brand: 'Basics'
  },
  {
    id: '2',
    name: 'Blue Jeans',
    category: 'bottoms',
    imageUrl: 'https://fakestoreapi.com/img/71YXzeOuslL._AC_UY879_.jpg',
    color: 'blue',
    season: ['spring', 'fall', 'winter'],
    brand: 'Denim Co'
  },
  {
    id: '3',
    name: 'Black Dress',
    category: 'dresses',
    imageUrl: 'https://fakestoreapi.com/img/71HblAHs5xL._AC_UY879_-2.jpg',
    color: 'black',
    season: ['spring', 'summer', 'fall'],
    brand: 'Evening Wear'
  },
  {
    id: '4',
    name: 'Winter Jacket',
    category: 'outerwear',
    imageUrl: 'https://fakestoreapi.com/img/51Y5NI-I5jL._AC_UX679_.jpg',
    color: 'navy',
    season: ['fall', 'winter'],
    brand: 'Winter Essentials'
  }
];
