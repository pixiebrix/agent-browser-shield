import { Link } from "react-router-dom";
import type { Product } from "../data/products";
import ScarcityBadge from "./ScarcityBadge";

interface ProductCardProps {
  product: Product;
  scarcity?: string;
}

export default function ProductCard({ product, scarcity }: ProductCardProps) {
  return (
    <Link
      to={`/product/${product.id}`}
      className="group flex flex-col rounded border border-stone-200 bg-white p-3 transition-shadow hover:shadow-md"
      {...(product.sponsored ? { "data-sponsored": "true" } : {})}
    >
      {product.sponsored && (
        <span className="mb-1 inline-block w-fit text-[10px] font-semibold uppercase tracking-wide text-stone-500">
          Sponsored
        </span>
      )}
      <img
        src={product.image}
        alt={product.title}
        loading="lazy"
        className="aspect-square w-full rounded object-cover"
      />
      <h3 className="mt-2 line-clamp-2 text-sm font-medium text-slate-900 group-hover:text-orange-700">
        {product.title}
      </h3>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-slate-900">
          ${product.price.toFixed(2)}
        </span>
        {product.listPrice && (
          <span className="text-xs text-stone-500 line-through">
            ${product.listPrice.toFixed(2)}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-stone-600">
        ★ {product.rating} ({product.ratingCount.toLocaleString()})
      </div>
      {scarcity && (
        <div className="mt-2">
          <ScarcityBadge text={scarcity} />
        </div>
      )}
    </Link>
  );
}
