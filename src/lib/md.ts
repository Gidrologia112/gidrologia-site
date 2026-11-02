// Текст из кабинета редактора: Markdown или HTML (перенесённые со старого сайта тексты — HTML).
import { marked } from 'marked';
export const md = (s?: string) => (s ? (marked.parse(s, { async: false }) as string) : '');
