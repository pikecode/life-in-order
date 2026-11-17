"use client";
import Form from "next/form";
import SearchButton from "./knowledge/search-button";
import {beginSearch} from "@/lib/usage-client";
export default function HomeSearchForm(){
  return <Form action="/knowledge" autoComplete="off" onSubmit={event => beginSearch(event.currentTarget)}>
    <label htmlFor="home-query">你想了解什么？</label>
    <input type="hidden" name="mode" value="hybrid" />
    <div className="knowledge-search">
      <textarea id="home-query" autoComplete="off" name="q" maxLength={500} required rows={3}
        placeholder="比如：押金不退怎么办、睡不好、医保断缴……" />
      <SearchButton label="搜一搜知识 →" />
    </div>
  </Form>;
}
