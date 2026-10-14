-- Importa o catálogo completo da planilha ex/catalogo_lunet_completo.xlsx.
-- A substituição remove também saldos e movimentações vinculados aos produtos antigos.
alter table public.products add column if not exists image_url text;

delete from public.stock_movements;
delete from public.stock_balances;
delete from public.products;

insert into public.products (name, sku, category, description, unit, stock_known, active, image_url)
values
  ('MULTICOCHO 200', 'PD00001', 'Multicocho', 'Características:
- Feito em polipropileno maciço - 2m de comprimento - Abertura de 0,65m 
- Profundidade de 0,34m - Capacidade para 300 litros - Peso de 42kg
Ideal para:
- Suplementação a pasto - Semiconfinamento - Fornecimento de ração', null, false, true, '/product-images/PD00001.jpeg'),
  ('MULTICOCHO 250', 'PD00002', 'Multicocho', 'Características:
- Feito em polipropileno maciço - 2,5m de comprimento - Abertura de 0,40m
- Profundidade de 0,23m - Capacidade para 200 litros - Peso de 37kg
Ideal para:
- Suplementação a pasto - Semiconfinamento - Fornecimento de ração', null, false, true, '/product-images/PD00002.jpeg'),
  ('MULTICOCHO 200 CONFINAMENTO LINHA J', 'PD00003', 'Multicocho', 'CARACTERISTICAS:
-FEITO EM POLIPROPILENO MACIÇO - 2M DE COMPRIMENTO A UNIDADE 
- ABERTURA DE 0,65M - PROFUNDIDADE DE 0,34M - CAPACIDADE PARA 300 LITROS
 - PESO DE 40KG A UNIDADE - PARAFUSOS EM INOX
IDEAL PARA:
- SUPLEMENTAÇÃO A PASTO - SEMICONFINAMENTO - FORNECIMENTO DE RAÇÃO
FACIL INSTALAÇÃO E MANEJO NO CAMPO.

OBS: VAI COMPLETO JÁ COM PARAFUSOS EM INOX PARA MONTAGEM DA LINHA DE COCHO, OS COCHOS SÃO TODOS VAZADOS E SOMENTE AS PONTAS TEM FECHAMENTO, POR ISSO INFORMAR NO ATO DO PEDIDO EM QUANTAS LINHAS SERÃO MONTADO PARA ASSIM ENVIARMOS A QUANTIDADE DE FECHAMENTO CORRETO.', null, false, true, '/product-images/PD00003.jpeg'),
  ('PROTECOCHO BANDA (LATERAL)', 'PD00004', 'Protecocho', null, null, false, true, '/product-images/PD00004.jpeg'),
  ('PROTECOCHO AUTOABASTECIMENTO', 'PD00005', 'Protecocho', 'Composição do kit:
- 1 Alimentador - 2 Suportes do alimentador  - 2 Pés/Laterais  - 2 PÇS Reservatórios 
- 1 Telhado (com pintura epóxi)  + Parafusos Inox
Características:
- 2m de largura - 1,70m de altura  - Capacidade para 400kg - Feito em polipropileno maciço - Telhado retrátil - Altura do alimentador regulável', null, false, true, null),
  ('PROTECOCHO CREEP', 'PD00006', 'Protecocho', null, null, false, true, null),
  ('PROTECOCHO 200 SEM COBERTURA', 'PD00007', 'Protecocho', '*Duas Laterais
*Um cocho de 2 metros 
*Kit Parafuso de fixação cocho 2mt nas laterais.', null, false, true, '/product-images/PD00007.jpeg'),
  ('PROTECOCHO 200 COM COBERTURA', 'PD00008', 'Protecocho', null, null, false, true, null),
  ('PROTECOCHO 250 SEM COBERTURA', 'PD00009', 'Protecocho', null, null, false, true, '/product-images/PD00009.jpeg'),
  ('PROTECOCHO 400 SEM COBERTURA', 'PD00010', 'Protecocho', null, null, false, true, '/product-images/PD00010.jpeg'),
  ('PROTECOCHO 500 SEM COBERTURA', 'PD00011', 'Protecocho', null, null, false, true, '/product-images/PD00011.jpeg'),
  ('PROTECOCHO 600 SEM COBERTURA', 'PD00012', 'Protecocho', null, null, false, true, '/product-images/PD00012.jpeg'),
  ('PROTECOCHO 750 SEM COBERTURA', 'PD00013', 'Protecocho', null, null, false, true, '/product-images/PD00013.jpeg'),
  ('MULTICOCHO 200 COM PÉ', 'PD000143', 'Multicocho', 'Características:
- Feito em polipropileno maciço - 2m de comprimento - Abertura de 0,65m 
- Profundidade de 0,34m - Capacidade para 300 litros - Peso de 42kg
Ideal para:
- Suplementação a pasto - Semiconfinamento - Fornecimento de ração', null, false, true, '/product-images/PD000143.jpeg'),
  ('MULTICOCHO 200 CONFINAMENTO LINHA U', 'PD000149', 'Multicocho', 'CARACTERISTICAS:
-FEITO EM POLIPROPILENO MACIÇO - 2M DE COMPRIMENTO A UNIDADE 
- ABERTURA DE 0,65M - PROFUNDIDADE DE 0,34M - CAPACIDADE PARA 300 LITROS
 - PESO DE 40KG A UNIDADE - PARAFUSOS EM INOX
IDEAL PARA:
- SUPLEMENTAÇÃO A PASTO - SEMICONFINAMENTO - FORNECIMENTO DE RAÇÃO
FACIL INSTALAÇÃO E MANEJO NO CAMPO.

OBS: VAI COMPLETO JÁ COM PARAFUSOS EM INOX PARA MONTAGEM DA LINHA DE COCHO, OS COCHOS SÃO TODOS VAZADOS E SOMENTE AS PONTAS TEM FECHAMENTO, POR ISSO INFORMAR NO ATO DO PEDIDO EM QUANTAS LINHAS SERÃO MONTADO PARA ASSIM ENVIARMOS A QUANTIDADE DE FECHAMENTO CORRETO.', null, false, true, '/product-images/PD000149.jpeg'),
  ('SUPORTE PARA COCHO CONFINAMENTO PÉ RETO UNIÃO S/ PARAFUSO', 'PD000179', 'Protecocho', null, null, false, true, '/product-images/PD000179.jpeg'),
  ('SUPORTE PARA COCHO CONFINAMENTO J ABERTO C/ PARAFUSO', 'PD000181', 'Protecocho', null, null, false, true, '/product-images/PD000181.jpeg'),
  ('LATERAL AUTOABASTECIMENTO SEM PARAFUSO', 'PD000182', 'Protecocho', null, null, false, true, '/product-images/PD000182.jpeg'),
  ('NUTRISILO', 'PD00037', 'Nutrisilo', null, null, false, true, null),
  ('COCHO DUPLO', 'PD00057', 'Protecocho', null, null, false, true, null),
  ('TELHADO 200', 'PD00067', 'Protecocho', null, null, false, true, null),
  ('SUPORTE PARA COCHO CONFINAMENTO J ABERTO S/ PARAFUSO', 'PD00103', 'Protecocho', null, null, false, true, '/product-images/PD00103.jpeg'),
  ('SUPORTE PARA COCHO CONFINAMENTO J FECHADO S/ PARAFUSO', 'PD00104', 'Protecocho', null, null, false, true, '/product-images/PD00104.jpeg'),
  ('SUPORTE PARA COCHO H C/ PARAFUSO', 'PD00109', 'Protecocho', null, null, false, true, '/product-images/PD00109.jpeg'),
  ('RESERVATORIO AUTOABASTECIMENTO', 'PD00110', 'Protecocho', null, null, false, true, '/product-images/PD00110.jpeg'),
  ('LATERAL AUTOABASTECIMENTO COM PARAFUSO', 'PD00111', 'Protecocho', null, null, false, true, '/product-images/PD00111.jpeg'),
  ('COCHO AUTOABASTECIMENTO', 'PD00112', 'Protecocho', null, null, false, true, '/product-images/PD00112.jpeg'),
  ('TÁBUA DE NINHO', 'PD00117', 'Protecocho', null, null, false, true, '/product-images/PD00117.jpeg'),
  ('HIDRAMAX 1300', 'PD00152', 'Hidramax', 'Características do modelo Hidramax 1300:
- Capacidade para 1300 litros
- Peso 40kg
- Abertura 1,22m
- Comprimento 2,15m
- Altura 0,69m
- Fabricado em polietileno', null, false, true, null),
  ('PROTECOCHO 750 COM COBERTURA', 'PD00160', 'Protecocho', null, null, false, true, '/product-images/PD00160.jpeg'),
  ('PROTECOCHO 600 COM COBERTURA', 'PD00162', 'Protecocho', null, null, false, true, '/product-images/PD00162.jpeg'),
  ('PROTECOCHO 1000 COM COBERTURA (COCHO 200)', 'PD00165', 'Protecocho', null, null, false, true, '/product-images/PD00165.jpeg'),
  ('PROTECOCHO 400 COM COBERTURA', 'PD00171', 'Protecocho', null, null, false, true, null),
  ('PROTECOCHO 500 COM COBERTURA', 'PD00172', 'Protecocho', 'Composição do kit:
- Cochos plásticos de 2,5m - Laterais plásticas - Telhas plásticas de 2,70x0,85m
- Tubos de metal (pintura epóxi) + Parafusos Inox
Características:
- Abertura do cocho 0,40m - Profundidade do cocho 0,23m - Capacidade para 400 litros - Altura do telhado 1,90m- Feito em polipropileno maciço', null, false, true, null),
  ('PROTECOCHO 250 COM COBERTURA', 'PD00173', 'Protecocho', null, null, false, true, null),
  ('COCHO MATRIZ 20 LT', 'PD00183', 'Protecocho', null, null, false, true, '/product-images/PD00183.jpeg'),
  ('PROTECOCHO 1000 COM COBERTURA (COCHO 250)', 'PD00260', 'Protecocho', null, null, false, true, '/product-images/PD00260.jpeg'),
  ('PROTECOCHO 1000 SEM COBERTURA', 'PD00261', 'Protecocho', null, null, false, true, null),
  ('MULTICOCHO 200 CONFINAMENTO SEM PÉS C/ PARAFUSO', 'PD00262', 'Multicocho', 'CARACTERISTICAS:
-FEITO EM POLIPROPILENO MACIÇO - 2M DE COMPRIMENTO A UNIDADE 
- ABERTURA DE 0,65M - PROFUNDIDADE DE 0,34M - CAPACIDADE PARA 300 LITROS
 - PESO DE 40KG A UNIDADE - PARAFUSOS EM INOX
IDEAL PARA:
- SUPLEMENTAÇÃO A PASTO - SEMICONFINAMENTO - FORNECIMENTO DE RAÇÃO
FACIL INSTALAÇÃO E MANEJO NO CAMPO.

OBS: VAI COMPLETO JÁ COM PARAFUSOS EM INOX PARA MONTAGEM DA LINHA DE COCHO, OS COCHOS SÃO TODOS VAZADOS E SOMENTE AS PONTAS TEM FECHAMENTO, POR ISSO INFORMAR NO ATO DO PEDIDO EM QUANTAS LINHAS SERÃO MONTADO PARA ASSIM ENVIARMOS A QUANTIDADE DE FECHAMENTO CORRETO.', null, false, true, '/product-images/PD00262.jpeg'),
  ('MULTICOCHO 200 CONFINAMENTO SEM PÉS S/ PARAFUSO', 'PD00263', 'Multicocho', 'CARACTERISTICAS:
-FEITO EM POLIPROPILENO MACIÇO - 2M DE COMPRIMENTO A UNIDADE 
- ABERTURA DE 0,65M - PROFUNDIDADE DE 0,34M - CAPACIDADE PARA 300 LITROS
 - PESO DE 40KG A UNIDADE - PARAFUSOS EM INOX
IDEAL PARA:
- SUPLEMENTAÇÃO A PASTO - SEMICONFINAMENTO - FORNECIMENTO DE RAÇÃO
FACIL INSTALAÇÃO E MANEJO NO CAMPO.

OBS: VAI COMPLETO JÁ COM PARAFUSOS EM INOX PARA MONTAGEM DA LINHA DE COCHO, OS COCHOS SÃO TODOS VAZADOS E SOMENTE AS PONTAS TEM FECHAMENTO, POR ISSO INFORMAR NO ATO DO PEDIDO EM QUANTAS LINHAS SERÃO MONTADO PARA ASSIM ENVIARMOS A QUANTIDADE DE FECHAMENTO CORRETO.', null, false, true, '/product-images/PD00263.jpeg'),
  ('TELHADO COMPLETO AUTOABASTECIMENTO', 'PD017016', 'Protecocho', null, null, false, true, null),
  ('SUPORTE PARA COCHO CONFINAMENTO PÉ RETO FECHADO S/ PARAFUSO', 'PD01706', 'Protecocho', null, null, false, true, '/product-images/PD01706.jpeg'),
  ('SUPORTE PARA COCHO CONFINAMENTO PÉ RETO FECHADO C/ PARAFUSO', 'PD01708', 'Protecocho', null, null, false, true, null),
  ('SUPORTE PARA COCHO CONFINAMENTO PÉ RETO UNIÃO C/ PARAFUSO', 'PD01710', 'Protecocho', null, null, false, true, null),
  ('SUPORTE PARA COCHO PÉ H COM PARAFUSO', 'PD01712', 'Protecocho', null, null, false, true, null),
  ('SUPORTE PARA COCHO CONFINAMENTO J FECHADO C/ PARAFUSO', 'PD01720', 'Protecocho', null, null, false, true, '/product-images/PD01720.jpeg'),
  ('SUPORTE PARA COCHO H S/ PARAFUSO', 'PD01728', 'Protecocho', null, null, false, true, '/product-images/PD01728.jpeg'),
  ('COCHO MATRIZ 42 LT', 'PD01729', 'Protecocho', null, null, false, true, '/product-images/PD01729.jpeg'),
  ('COCHO 1,5M', 'PD01730', 'Protecocho', null, null, false, true, '/product-images/PD01730.jpeg'),
  ('HIDRAMAX 600', 'PD01740', 'Hidramax', 'Características do modelo Hidramax 1300:
- Capacidade para 1300 litros
- Peso 40kg
- Abertura 1,22m
- Comprimento 2,15m
- Altura 0,69m
- Fabricado em polietileno', null, false, true, '/product-images/PD01740.jpeg'),
  ('COCHO MATRIZ 10 LT COM PÉS', 'PD01742', 'Protecocho', null, null, false, true, '/product-images/PD01742.jpeg'),
  ('COCHO MATRIZ 20 LT COM PÉS', 'PD01744', 'Protecocho', null, null, false, true, '/product-images/PD01744.jpeg'),
  ('COCHO MATRIZ 42 LT COM PÉS', 'PD01746', 'Protecocho', null, null, false, true, '/product-images/PD01746.jpeg')
;