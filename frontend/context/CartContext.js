import { createContext, useContext, useEffect, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('cart');
    if (saved) setItems(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  function addItem(dish, kolicina = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.dish_id === dish.id);
      if (existing) {
        return prev.map((i) =>
          i.dish_id === dish.id ? { ...i, kolicina: i.kolicina + kolicina } : i
        );
      }
      return [...prev, { dish_id: dish.id, naziv: dish.naziv, cena: dish.cena, kolicina }];
    });
  }

  function updateQty(dishId, kolicina) {
    if (kolicina < 1) return;
    setItems((prev) => prev.map((i) => (i.dish_id === dishId ? { ...i, kolicina } : i)));
  }

  function removeItem(dishId) {
    setItems((prev) => prev.filter((i) => i.dish_id !== dishId));
  }

  function clearCart() {
    setItems([]);
  }

  const total = items.reduce((sum, i) => sum + i.kolicina * Number(i.cena), 0);
  const count = items.reduce((sum, i) => sum + i.kolicina, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}